/**
 * Re-queue threads whose extraction previously failed (transient errors).
 * Resets them to 'pending' and enqueues extraction; the running worker
 * processes them, then embeds the resulting Q&A pairs.
 */
import { query } from '../src/shared/db.js';
import { enqueueExtraction } from '../src/shared/queue.js';
import { logger } from '../src/shared/logger.js';

async function main() {
  const { rows } = await query<{ id: string }>(
    `UPDATE threads SET extraction_status = 'pending', extraction_reason = NULL
     WHERE extraction_status = 'failed' RETURNING id`);
  for (const r of rows) await enqueueExtraction(r.id);
  logger.info({ count: rows.length }, 're-queued failed threads for extraction');
  console.log(`Re-queued ${rows.length} previously-failed threads.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
