import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { getConfig } from '../shared/config.js';
import { query } from '../shared/db.js';
import { logger } from '../shared/logger.js';
import { ask } from '../query/engine.js';
import { deactivateQaPair, updateQaPair, listQaPairs, listSourceLabels, markReviewed, ingestManualEntry, listOpenQuestions, answerOpenQuestion, dismissOpenQuestion } from '../knowledge/store.js';
import { getTeamsChannels } from '../sync/teams.js';
import { enqueueMboxProcessing, enqueueTeamsSync } from '../shared/queue.js';

const config = getConfig();
const app = Fastify({ logger: false, bodyLimit: 100 * 1024 * 1024 });
await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

// Upload .mbox
app.post('/api/uploads/mbox', async (req, reply) => {
  const data = await req.file();
  if (!data) return reply.code(400).send({ error: 'no file' });
  if (!data.filename.toLowerCase().endsWith('.mbox')) return reply.code(400).send({ error: 'expected .mbox file' });
  fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
  const uploadId = randomUUID();
  const dest = path.join(config.UPLOAD_DIR, `${uploadId}.mbox`);
  await new Promise<void>((res, rej) => { const out = fs.createWriteStream(dest); data.file.pipe(out); out.on('finish', res); out.on('error', rej); });
  const stat = fs.statSync(dest);
  await query(`INSERT INTO source_uploads (id, kind, filename, bytes, status) VALUES ($1, 'mbox', $2, $3, 'pending')`, [uploadId, data.filename, stat.size]);
  await enqueueMboxProcessing(uploadId, dest);
  return reply.send({ uploadId, filename: data.filename, bytes: stat.size, status: 'pending' });
});

// List configured Teams channels (label only — no IDs leaked to the client)
app.get('/api/channels', async () => getTeamsChannels().map((c) => ({ label: c.label })));

// Trigger Teams sync. Body: { channel?: label, since?: ISO }. With no channel,
// syncs ALL configured channels (one job each).
app.post('/api/sync/teams', async (req, reply) => {
  const body = req.body as { since?: string; channel?: string } | undefined;
  const channels = getTeamsChannels();
  if (channels.length === 0) return reply.code(400).send({ error: 'No Teams channels configured. Set TEAMS_CHANNELS in .env.' });
  const targets = body?.channel ? channels.filter((c) => c.label === body.channel) : channels;
  if (targets.length === 0) return reply.code(400).send({ error: `Channel "${body?.channel}" not configured.` });

  const queued: { syncId: string; channel: string }[] = [];
  for (const c of targets) {
    const syncId = randomUUID();
    await query(`INSERT INTO source_uploads (id, kind, filename, status) VALUES ($1, 'teams_sync', $2, 'pending')`, [syncId, c.label]);
    await enqueueTeamsSync(syncId, body?.since ?? null, c.label);
    queued.push({ syncId, channel: c.label });
  }
  return reply.send({ queued, status: 'pending' });
});

// Upload/sync status
app.get('/api/uploads', async () => (await query(`SELECT * FROM source_uploads ORDER BY created_at DESC LIMIT 50`)).rows);
app.get<{ Params: { id: string } }>('/api/uploads/:id', async (req, reply) => {
  const { rows } = await query(`SELECT * FROM source_uploads WHERE id = $1`, [req.params.id]);
  return rows[0] ? reply.send(rows[0]) : reply.code(404).send({ error: 'not found' });
});

// Ask the KB
app.post('/api/ask', async (req, reply) => {
  const parsed = z.object({ question: z.string().min(2).max(2000), userEmail: z.string().email().optional(), topK: z.number().int().min(1).max(20).optional() }).safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.format() });
  try { return reply.send(await ask(parsed.data.question, { userEmail: parsed.data.userEmail, topK: parsed.data.topK })); }
  catch (err) { logger.error({ err }, 'ask failed'); return reply.code(500).send({ error: (err as Error).message }); }
});

// Feedback
app.post('/api/feedback', async (req, reply) => {
  const parsed = z.object({ queryId: z.string().uuid(), rating: z.union([z.literal(1), z.literal(-1)]), feedback: z.string().max(2000).optional() }).safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.format() });
  await query(`UPDATE query_log SET user_rating = $2, user_feedback = $3 WHERE id = $1`, [parsed.data.queryId, parsed.data.rating, parsed.data.feedback ?? null]);
  return reply.send({ ok: true });
});

// Admin Q&A
app.get<{ Querystring: { category?: string; q?: string; source?: string; review?: string; limit?: string; offset?: string } }>('/api/qa', async (req) => {
  const rv = req.query.review;
  return listQaPairs({
    category: req.query.category, search: req.query.q, sourceLabel: req.query.source,
    reviewFilter: rv === 'unreviewed' || rv === 'reviewed' ? rv : undefined,
    limit: req.query.limit ? parseInt(req.query.limit) : 50,
    offset: req.query.offset ? parseInt(req.query.offset) : 0,
  });
});
app.get('/api/qa/sources', async () => listSourceLabels());
// Batch-mark entries as reviewed — must come before /:id routes
app.post('/api/qa/batch-review', async (req, reply) => {
  const parsed = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.format() });
  const count = await markReviewed(parsed.data.ids);
  return reply.send({ ok: true, count });
});
app.post('/api/qa', async (req, reply) => {
  const parsed = z.object({
    question: z.string().min(3).max(2000),
    answer: z.string().min(1).max(8000),
    category: z.string().max(60).optional(),
    sourceLabel: z.string().max(60).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.format() });
  const result = await ingestManualEntry(parsed.data);
  if ('rejected' in result) return reply.code(422).send({ error: result.rejected });
  return reply.send({ ok: true, id: result.id });
});
app.post<{ Params: { id: string }; Body: { reason: string } }>('/api/qa/:id/deactivate', async (req, reply) => { await deactivateQaPair(req.params.id, req.body.reason); return reply.send({ ok: true }); });
app.patch<{ Params: { id: string } }>('/api/qa/:id', async (req, reply) => {
  const parsed = z.object({
    question: z.string().min(3).max(2000).optional(),
    answer: z.string().min(1).max(8000).optional(),
    category: z.string().max(60).nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.format() });
  const ok = await updateQaPair(req.params.id, parsed.data);
  if (!ok) return reply.code(404).send({ error: 'Entry not found or nothing to update' });
  return reply.send({ ok: true });
});

// Open Questions bank — gaps the bot couldn't answer, awaiting human answers
app.get<{ Querystring: { status?: 'open' | 'answered' | 'dismissed' } }>('/api/open-questions', async (req) =>
  listOpenQuestions(req.query.status ?? 'open'));
app.post<{ Params: { id: string } }>('/api/open-questions/:id/answer', async (req, reply) => {
  const parsed = z.object({ answer: z.string().min(1).max(8000), answeredBy: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.format() });
  try {
    const qaId = await answerOpenQuestion(req.params.id, parsed.data.answer, parsed.data.answeredBy);
    return reply.send({ ok: true, qaId });
  } catch (err) { return reply.code(400).send({ error: (err as Error).message }); }
});
app.post<{ Params: { id: string }; Body: { reason?: string } }>('/api/open-questions/:id/dismiss', async (req, reply) => {
  await dismissOpenQuestion(req.params.id, req.body?.reason);
  return reply.send({ ok: true });
});

// Stats — used by both the sidebar count and the Dashboard view
app.get('/api/stats', async () => {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*) FROM qa_pairs WHERE is_active)::int                                             AS active_qa,
      (SELECT COUNT(*) FROM qa_embeddings e JOIN qa_pairs q ON q.id = e.qa_id WHERE q.is_active)::int AS embedded_qa,
      (SELECT COUNT(*) FROM threads)::int                                                              AS threads_total,
      (SELECT COUNT(*) FROM query_log WHERE created_at >= now() - interval '7 days')::int             AS queries_7d,
      (SELECT COUNT(*) FROM qa_pairs WHERE is_active AND created_at >= now() - interval '7 days')::int AS entries_added_7d,
      (SELECT COUNT(*) FROM open_questions WHERE status = 'open')::int                                AS open_questions_count,
      (SELECT COUNT(*) FROM qa_pairs WHERE is_active AND is_reviewed = false)::int                    AS unreviewed_count,
      (SELECT COALESCE(
         ROUND(100.0 * COUNT(*) FILTER (WHERE COALESCE(sufficient_context, confidence >= 0.6))
               / NULLIF(COUNT(*), 0))::int, 0)
       FROM query_log WHERE created_at >= now() - interval '7 days')                                  AS answer_rate_7d
  `);
  return rows[0];
});

// Product Feedback notes — universal team notepad
app.get('/api/feedback-notes', async () => {
  const { rows } = await query(
    `SELECT id, body, created_at FROM product_feedback ORDER BY created_at DESC LIMIT 500`);
  return rows;
});
app.post('/api/feedback-notes', async (req, reply) => {
  const parsed = z.object({ body: z.string().min(1).max(4000) }).safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.format() });
  const { rows } = await query<{ id: string; created_at: string }>(
    `INSERT INTO product_feedback (body) VALUES ($1) RETURNING id, created_at`,
    [parsed.data.body.trim()]);
  return reply.send({ ok: true, id: rows[0]!.id, created_at: rows[0]!.created_at });
});
app.delete<{ Params: { id: string } }>('/api/feedback-notes/:id', async (req, reply) => {
  await query(`DELETE FROM product_feedback WHERE id = $1`, [req.params.id]);
  return reply.send({ ok: true });
});

app.get('/health', async () => ({ ok: true }));

async function main() {
  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
  logger.info({ port: config.API_PORT }, 'LendingGenie API up');
}
main().catch((err) => { logger.error({ err }, 'API fail'); process.exit(1); });
