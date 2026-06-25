import { randomUUID } from 'crypto';
import { z } from 'zod';
import { query, withTransaction } from '../shared/db.js';
import { getEmbeddings } from '../shared/embeddings.js';
import { callClaude } from '../shared/claude-client.js';
import { getConfig } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { enqueueEmbedBatch } from '../shared/queue.js';
import { ExtractionResult } from '../shared/schemas.js';

const config = getConfig();

export async function persistExtractionResult(threadId: string, result: ExtractionResult): Promise<string[]> {
  if (!result.is_qa_thread || result.qa_pairs.length === 0) {
    await query(`UPDATE threads SET extraction_status = 'skipped_not_qa', extraction_reason = $2 WHERE id = $1`, [threadId, result.reason]);
    return [];
  }
  const ids: string[] = [];
  await withTransaction(async (c) => {
    for (const p of result.qa_pairs) {
      const id = randomUUID();
      await c.query(`INSERT INTO qa_pairs (id, thread_id, question, answer, category, tags, extraction_confidence, source_label)
        VALUES ($1,$2,$3,$4,$5,$6,$7, (SELECT source_label FROM threads WHERE id = $2))`,
        [id, threadId, p.question, p.answer, p.category, p.tags, p.confidence]);
      ids.push(id);
    }
    await c.query(`UPDATE threads SET extraction_status = 'extracted', extraction_reason = $2 WHERE id = $1`, [threadId, result.reason]);
  });
  logger.info({ threadId, pairs: ids.length }, 'persisted extraction');
  return ids;
}

export async function embedPending(batchSize = 64): Promise<number> {
  const emb = getEmbeddings();
  let total = 0;
  while (true) {
    const { rows } = await query<{ id: string; question: string; answer: string }>(
      `SELECT q.id, q.question, q.answer FROM qa_pairs q LEFT JOIN qa_embeddings e ON e.qa_id = q.id WHERE q.is_active = true AND e.qa_id IS NULL LIMIT $1`, [batchSize]);
    if (rows.length === 0) break;
    const texts = rows.map((r) => `Q: ${r.question}\n\nA: ${r.answer}`);
    const vecs = await emb.embed(texts, 'document');
    await withTransaction(async (c) => {
      for (let i = 0; i < rows.length; i++)
        await c.query(`INSERT INTO qa_embeddings (qa_id, embedding) VALUES ($1, $2::vector) ON CONFLICT (qa_id) DO UPDATE SET embedding = EXCLUDED.embedding, embedded_at = now()`,
          [rows[i]!.id, JSON.stringify(vecs[i])]);
    });
    total += rows.length;
    logger.info({ batch: rows.length, total }, 'embedded batch');
  }
  return total;
}

export interface RetrievalHit { qaId: string; question: string; answer: string; category: string | null; tags: string[]; similarity: number; }

export async function retrieve(queryText: string, k: number, floor = 0.55): Promise<RetrievalHit[]> {
  const [vec] = await getEmbeddings().embed([queryText], 'query');
  if (!vec) return [];
  const { rows } = await query<{ qa_id: string; question: string; answer: string; category: string | null; tags: string[]; similarity: number }>(
    `SELECT q.id AS qa_id, q.question, q.answer, q.category, q.tags, 1 - (e.embedding <=> $1::vector) AS similarity
     FROM qa_embeddings e JOIN qa_pairs q ON q.id = e.qa_id WHERE q.is_active = true AND 1 - (e.embedding <=> $1::vector) >= $2
     ORDER BY e.embedding <=> $1::vector LIMIT $3`,
    [JSON.stringify(vec), floor, k]);
  return rows.map((r) => ({ qaId: r.qa_id, question: r.question, answer: r.answer, category: r.category, tags: r.tags, similarity: r.similarity }));
}

export async function deactivateQaPair(id: string, reason: string) {
  await query(`UPDATE qa_pairs SET is_active = false, curator_notes = COALESCE(curator_notes,'') || E'\n[deactivated] ' || $2 WHERE id = $1`, [id, reason]);
}

// Edit an existing entry. Any change to question/answer makes the embedding
// stale, so we drop it and re-queue embedding (embedPending re-embeds rows
// that have no embedding row).
export async function updateQaPair(id: string, fields: { question?: string; answer?: string; category?: string | null }): Promise<boolean> {
  const sets: string[] = []; const params: unknown[] = [];
  if (fields.question !== undefined) { params.push(fields.question.trim()); sets.push(`question = $${params.length}`); }
  if (fields.answer !== undefined) { params.push(fields.answer.trim()); sets.push(`answer = $${params.length}`); }
  if (fields.category !== undefined) { params.push(fields.category?.trim() || null); sets.push(`category = $${params.length}`); }
  if (sets.length === 0) return false;
  sets.push(`curator_notes = COALESCE(curator_notes,'') || E'\n[edited] ' || now()::text`);
  params.push(id);
  const res = await query(`UPDATE qa_pairs SET ${sets.join(', ')} WHERE id = $${params.length} AND is_active = true`, params);
  if (!res.rowCount) return false;
  await query(`DELETE FROM qa_embeddings WHERE qa_id = $1`, [id]);
  await enqueueEmbedBatch();
  logger.info({ id }, 'updated qa_pair (re-embedding)');
  return true;
}

export async function listQaPairs(opts: { category?: string; limit?: number; offset?: number; search?: string; sourceLabel?: string; reviewFilter?: 'unreviewed' | 'reviewed' }) {
  const { category, limit = 50, offset = 0, search, sourceLabel, reviewFilter } = opts;
  const filters: unknown[] = []; const where: string[] = ['is_active = true'];
  if (category) { filters.push(category); where.push(`category = $${filters.length}`); }
  if (sourceLabel) { filters.push(sourceLabel); where.push(`source_label = $${filters.length}`); }
  if (search) { filters.push(`%${search}%`); where.push(`(question ILIKE $${filters.length} OR answer ILIKE $${filters.length})`); }
  if (reviewFilter === 'unreviewed') where.push(`is_reviewed = false`);
  if (reviewFilter === 'reviewed') where.push(`is_reviewed = true`);
  const whereSql = where.join(' AND ');

  const totalRes = await query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM qa_pairs WHERE ${whereSql}`, filters);
  const total = Number(totalRes.rows[0]?.count ?? 0);

  const params = [...filters, limit, offset];
  const { rows } = await query(`SELECT id, question, answer, category, tags, source_label, origin, extraction_confidence, is_reviewed, created_at FROM qa_pairs WHERE ${whereSql} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { items: rows, total, limit, offset };
}

export async function markReviewed(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const res = await query(`UPDATE qa_pairs SET is_reviewed = true WHERE id = ANY($1::uuid[]) AND is_active = true`, [ids]);
  logger.info({ count: res.rowCount, total: ids.length }, 'marked reviewed');
  return res.rowCount ?? 0;
}

// Distinct source labels present in the KB, for UI filtering.
export async function listSourceLabels(): Promise<string[]> {
  const { rows } = await query<{ source_label: string }>(
    `SELECT DISTINCT source_label FROM qa_pairs WHERE is_active = true AND source_label IS NOT NULL ORDER BY source_label`);
  return rows.map((r) => r.source_label);
}

// Insert a curated Q&A entry and queue it for embedding (immediately searchable).
export async function createQaPair(opts: {
  question: string; answer: string; category?: string | null; tags?: string[]; sourceLabel?: string;
}): Promise<string> {
  const id = randomUUID();
  await query(
    `INSERT INTO qa_pairs (id, thread_id, question, answer, category, tags, extraction_confidence, origin, source_label, curator_notes, is_reviewed)
     VALUES ($1, NULL, $2, $3, $4, $5, 1.0, 'curated', $6, 'Manually added via Knowledge Base', true)`,
    [id, opts.question.trim(), opts.answer.trim(), opts.category?.trim() || null, opts.tags?.length ? opts.tags : ['manual'], opts.sourceLabel || 'Manual']);
  await enqueueEmbedBatch();
  logger.info({ id }, 'created curated qa_pair');
  return id;
}

// -- Quality ingestion for manually-added entries ---------
// We do NOT store a curator's draft at face value. We pass it through Claude
// to clean wording/grammar, shape a clear standalone question, write the
// answer in our support voice (no markdown, no em dashes), and assign a
// category + tags. We reject drafts that are empty, gibberish, or off-topic
// (not about LendingGenie's credit and loan offerings). We never invent facts.
const MANUAL_INGEST_SYSTEM = `You are a meticulous knowledge base editor for LendingGenie, an AI chatbot platform that helps users with credit analysis, loan eligibility checks, and loan matching. A support team member has drafted a Q&A to add to our knowledge base. Turn the draft into one clean, high-quality entry.

Do:
- Rewrite the QUESTION as a clear, standalone question a customer or agent would actually ask.
- Rewrite the ANSWER to be accurate, concise, and professional in a warm support voice. Fix grammar and structure.
- Suggest a short lowercase category (e.g. credit-basics, credit-score, loan-eligibility, loan-types, repayment, rates, application) and 1 to 4 short tags.
- Preserve the original meaning. Do NOT invent facts, numbers, policies, or details that are not in the draft. Only clean, clarify, and structure what was provided.
- Use no Markdown symbols and no em dashes.

Set usable=false only if the draft is empty, gibberish, or clearly not about credit, loans, LendingGenie offerings, or support. Give a short reason.

Return JSON: { "usable": boolean, "reason": string, "question": string, "answer": string, "category": string, "tags": string[] }`;

const ManualIngestSchema = z.object({
  usable: z.boolean(),
  reason: z.string().optional().default(''),
  question: z.string().optional().default(''),
  answer: z.string().optional().default(''),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
});

export async function ingestManualEntry(raw: { question: string; answer: string; category?: string; sourceLabel?: string }): Promise<{ id: string } | { rejected: string }> {
  const user = `# Draft question\n${raw.question}\n\n# Draft answer\n${raw.answer}${raw.category ? `\n\n# Suggested category\n${raw.category}` : ''}\n\nClean and structure this into one knowledge base entry. Return JSON only.`;
  const { data } = await callClaude<z.infer<typeof ManualIngestSchema>>({ model: config.ANTHROPIC_MODEL_DEFAULT, systemPrompt: MANUAL_INGEST_SYSTEM, userMessage: user, maxTokens: 1024, responseSchema: ManualIngestSchema });
  if (!data.usable || !data.question.trim() || !data.answer.trim()) {
    return { rejected: data.reason || 'This does not look like a usable LendingGenie knowledge entry.' };
  }
  const id = await createQaPair({
    question: data.question, answer: data.answer,
    category: data.category ?? raw.category ?? null, tags: data.tags,
    sourceLabel: raw.sourceLabel || 'Manual',
  });
  return { id };
}

// --- Open Questions bank ------------------------------------
// Questions the bot couldn't confidently answer, queued for a human to
// answer manually. Deduped by normalized text, with an ask_count so the
// most-requested gaps surface first.

export async function recordOpenQuestion(opts: {
  question: string; queryId?: string; askedBy?: string; reason: string; bestConfidence: number;
}): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM open_questions WHERE status = 'open' AND lower(trim(question)) = lower(trim($1)) LIMIT 1`,
    [opts.question]);
  if (rows[0]) {
    await query(
      `UPDATE open_questions SET ask_count = ask_count + 1, updated_at = now(),
         best_confidence = GREATEST(COALESCE(best_confidence, 0), $2) WHERE id = $1`,
      [rows[0].id, opts.bestConfidence]);
    return;
  }
  await query(
    `INSERT INTO open_questions (question, source_query_id, asked_by, reason, best_confidence)
     VALUES ($1, $2, $3, $4, $5)`,
    [opts.question, opts.queryId ?? null, opts.askedBy ?? null, opts.reason, opts.bestConfidence]);
  logger.info({ q: opts.question.slice(0, 80), reason: opts.reason }, 'recorded open question');
}

export async function listOpenQuestions(status: 'open' | 'answered' | 'dismissed' = 'open') {
  const { rows } = await query(
    `SELECT id, question, ask_count, reason, best_confidence, status, answer, resulting_qa_id, created_at, updated_at
     FROM open_questions WHERE status = $1 ORDER BY ask_count DESC, created_at DESC LIMIT 200`, [status]);
  return rows;
}

// Answer an open question: create an active curated qa_pair, embed it, and
// mark the open question resolved. The curated answer is immediately
// retrievable, so the bot answers this question next time.
export async function answerOpenQuestion(id: string, answer: string, answeredBy?: string): Promise<string> {
  const { rows } = await query<{ question: string; status: string }>(
    `SELECT question, status FROM open_questions WHERE id = $1`, [id]);
  const oq = rows[0];
  if (!oq) throw new Error('open question not found');
  if (oq.status === 'answered') throw new Error('open question already answered');

  const qaId = randomUUID();
  await withTransaction(async (c) => {
    await c.query(
      `INSERT INTO qa_pairs (id, thread_id, question, answer, category, tags, extraction_confidence, origin, curator_notes)
       VALUES ($1, NULL, $2, $3, 'curated', $4, 1.0, 'curated', $5)`,
      [qaId, oq.question, answer, ['curated'], `Manually answered from open question ${id}`]);
    await c.query(
      `UPDATE open_questions SET status = 'answered', answer = $2, resulting_qa_id = $3, answered_by = $4, updated_at = now()
       WHERE id = $1`, [id, answer, qaId, answeredBy ?? null]);
  });
  await enqueueEmbedBatch();
  logger.info({ id, qaId }, 'answered open question → curated qa_pair');
  return qaId;
}

export async function dismissOpenQuestion(id: string, reason?: string) {
  await query(
    `UPDATE open_questions SET status = 'dismissed', updated_at = now(),
       answer = COALESCE(answer, '') || CASE WHEN $2::text IS NULL THEN '' ELSE E'\n[dismissed] ' || $2 END
     WHERE id = $1`, [id, reason ?? null]);
}
