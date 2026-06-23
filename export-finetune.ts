/**
 * Export active Q&A pairs as JSONL for fine-tuning (Bedrock format).
 * Usage: tsx scripts/export-finetune.ts [--min-confidence 0.7] [--category billing]
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { query } from '../src/shared/db.js';
import { logger } from '../src/shared/logger.js';

async function main() {
  const args = process.argv.slice(2);
  let minConf = 0.7;
  let category: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--min-confidence' && args[i + 1]) minConf = parseFloat(args[i + 1]!);
    if (args[i] === '--category' && args[i + 1]) category = args[i + 1]!;
  }

  const where = ['is_active = true', `extraction_confidence >= ${minConf}`];
  const params: unknown[] = [];
  if (category) {
    params.push(category);
    where.push(`category = $${params.length}`);
  }

  const { rows } = await query<{ question: string; answer: string }>(
    `SELECT question, answer FROM qa_pairs WHERE ${where.join(' AND ')} ORDER BY created_at`, params);

  if (rows.length === 0) { console.log('No Q&A pairs match filters.'); process.exit(0); }

  const outDir = './data/fine-tune-exports';
  fs.mkdirSync(outDir, { recursive: true });
  const filename = `cashera-ft-${new Date().toISOString().slice(0, 10)}-${rows.length}pairs.jsonl`;
  const dest = path.join(outDir, filename);
  const lines = rows.map((r) =>
    JSON.stringify({
      system: 'You are a Cashera Capital support agent. Answer using internal knowledge.',
      messages: [
        { role: 'user', content: r.question },
        { role: 'assistant', content: r.answer },
      ],
    })
  );
  fs.writeFileSync(dest, lines.join('\n') + '\n');

  await query(
    `INSERT INTO finetune_exports (id, filename, qa_count, format, filters) VALUES ($1,$2,$3,$4,$5)`,
    [randomUUID(), filename, rows.length, 'bedrock-jsonl', JSON.stringify({ minConf, category })]);

  logger.info({ filename, count: rows.length }, 'export done');
  console.log(`Wrote ${rows.length} pairs → ${dest}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
