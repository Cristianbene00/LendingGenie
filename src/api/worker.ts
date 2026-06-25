import fs from 'fs';
import { randomUUID } from 'crypto';
import { extractFromThread } from '../extraction/extractor.js';
import { embedPending, persistExtractionResult } from '../knowledge/store.js';
import { iterateMbox, normalizeEmail, NormalizedEmail } from '../parsers/mbox.js';
import { reconstructThreads } from '../parsers/threads.js';
import { fetchTeamsThreads, prefilterIsQaShaped, getTeamsChannels } from '../sync/teams.js';
import { query } from '../shared/db.js';
import { getConfig } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { enqueueEmbedBatch, enqueueExtraction, startWorkers } from '../shared/queue.js';
import { Thread, ThreadSchema } from '../shared/schemas.js';

const config = getConfig();

async function handleMbox({ uploadId, filePath }: { uploadId: string; filePath: string }) {
  logger.info({ uploadId }, 'mbox started');
  await query(`UPDATE source_uploads SET status = 'parsing' WHERE id = $1`, [uploadId]);

  const emails: NormalizedEmail[] = [];
  let count = 0;
  for await (const raw of iterateMbox(filePath)) {
    const n = normalizeEmail(raw.parsed, config.INTERNAL_EMAIL_DOMAIN);
    if (n) emails.push(n);
    count++;
    if (count % 500 === 0) logger.info({ uploadId, count }, 'mbox progress');
  }
  logger.info({ uploadId, total: count, kept: emails.length }, 'parsed');

  const threads = reconstructThreads(emails, config.INTERNAL_EMAIL_DOMAIN);
  let inserted = 0;
  for (const t of threads) {
    const id = randomUUID();
    const r = await query<{ id: string }>(`INSERT INTO threads (id, source_id, source_kind, topic, messages, participants, earliest_at, latest_at, dedup_key) VALUES ($1,$2,'email',$3,$4::jsonb,$5::jsonb,$6,$7,$8) ON CONFLICT (dedup_key) DO NOTHING RETURNING id`,
      [id, uploadId, t.topic, JSON.stringify(t.messages), JSON.stringify(t.participants), t.earliestAt, t.latestAt, t.dedupKey]);
    if (r.rows[0]) { await enqueueExtraction(r.rows[0].id); inserted++; }
  }
  await query(`UPDATE source_uploads SET status = 'extracting', thread_count = $2 WHERE id = $1`, [uploadId, inserted]);
  logger.info({ uploadId, inserted }, 'mbox handoff done');
  try { fs.unlinkSync(filePath); } catch {}
}

async function handleTeams({ syncId, since, channelLabel }: { syncId: string; since: string | null; channelLabel: string }) {
  logger.info({ syncId, channelLabel }, 'teams sync started');
  await query(`UPDATE source_uploads SET status = 'parsing' WHERE id = $1`, [syncId]);

  const channel = getTeamsChannels().find((c) => c.label === channelLabel);
  if (!channel) throw new Error(`channel "${channelLabel}" not found in TEAMS_CHANNELS config`);

  const threads = await fetchTeamsThreads(channel.teamId, channel.channelId, since);
  let passed = 0;
  for (const t of threads) {
    const pf = await prefilterIsQaShaped(t);
    if (!pf.pass) continue;
    passed++;
    const id = randomUUID();
    const r = await query<{ id: string }>(`INSERT INTO threads (id, source_id, source_kind, source_label, topic, messages, participants, earliest_at, latest_at, dedup_key) VALUES ($1,$2,'teams',$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9) ON CONFLICT (dedup_key) DO NOTHING RETURNING id`,
      [id, syncId, channelLabel, t.topic, JSON.stringify(t.messages), JSON.stringify(t.participants), t.earliestAt, t.latestAt, t.dedupKey]);
    if (r.rows[0]) await enqueueExtraction(r.rows[0].id);
  }
  await query(`UPDATE source_uploads SET status = 'extracting', thread_count = $2 WHERE id = $1`, [syncId, passed]);
  logger.info({ syncId, channelLabel, passed }, 'teams handoff done');
}

async function handleExtract({ threadId }: { threadId: string }) {
  const { rows } = await query(`SELECT id, source_kind, topic, messages, participants, earliest_at, latest_at, dedup_key FROM threads WHERE id = $1 AND extraction_status = 'pending'`, [threadId]);
  const row = rows[0] as { id: string; source_kind: 'email'|'teams'; topic: string; messages: unknown; participants: string[]; earliest_at: Date|null; latest_at: Date|null; dedup_key: string } | undefined;
  if (!row) return;
  const thread: Thread = ThreadSchema.parse({ id: row.id, sourceKind: row.source_kind, topic: row.topic, messages: row.messages, participants: row.participants, earliestAt: row.earliest_at, latestAt: row.latest_at, dedupKey: row.dedup_key });
  try {
    const { result } = await extractFromThread(thread);
    await persistExtractionResult(thread.id, result);
    await enqueueEmbedBatch();
  } catch (err) {
    logger.error({ err, threadId }, 'extraction fail');
    await query(`UPDATE threads SET extraction_status = 'failed', extraction_reason = $2 WHERE id = $1`, [threadId, (err as Error).message.slice(0, 500)]);
    throw err;
  }
}

async function handleEmbed() {
  const count = await embedPending();
  if (count > 0) logger.info({ count }, 'embed batch done');
  await query(`UPDATE source_uploads s SET status = 'complete', completed_at = now(), qa_count = (SELECT COUNT(*) FROM qa_pairs q JOIN threads t ON t.id = q.thread_id WHERE t.source_id = s.id)
    WHERE status = 'extracting' AND NOT EXISTS (SELECT 1 FROM threads t WHERE t.source_id = s.id AND t.extraction_status = 'pending')`);
}

async function main() {
  const ws = startWorkers({ mbox: handleMbox, teams: handleTeams, extract: handleExtract, embed: handleEmbed });
  logger.info('LendingGenie worker started');
  const stop = async () => { await Promise.all(ws.map((w) => w.close())); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
main().catch((err) => { logger.error({ err }, 'worker fail'); process.exit(1); });
