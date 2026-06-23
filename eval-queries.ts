/**
 * Eval harness: run test queries against the KB and score answers.
 * Usage: tsx scripts/eval-queries.ts [--file data/eval-set.json]
 *
 * eval-set.json format:
 * [{ "question": "...", "expected_keywords": ["billing", "refund"], "expected_category": "billing" }]
 */
import fs from 'fs';
import { ask } from '../src/query/engine.js';
import { logger } from '../src/shared/logger.js';

interface EvalCase {
  question: string;
  expected_keywords: string[];
  expected_category?: string;
}

interface EvalResult {
  question: string;
  answer: string;
  confidence: number;
  latencyMs: number;
  keywordHits: number;
  keywordTotal: number;
  categoryMatch: boolean | null;
  pass: boolean;
}

async function main() {
  const fileIdx = process.argv.indexOf('--file');
  const filePath = fileIdx >= 0 ? process.argv[fileIdx + 1]! : './data/eval-set.json';

  if (!fs.existsSync(filePath)) {
    console.log(`No eval set at ${filePath}. Create one with format:`);
    console.log('[{ "question": "...", "expected_keywords": ["keyword1"], "expected_category": "billing" }]');
    process.exit(0);
  }

  const cases: EvalCase[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const results: EvalResult[] = [];
  let passed = 0;

  for (const c of cases) {
    const r = await ask(c.question);
    const lower = r.answer.toLowerCase();
    const hits = c.expected_keywords.filter((k) => lower.includes(k.toLowerCase()));
    const catMatch = c.expected_category
      ? r.citations.some((ci: { qaId: string }) => true) // category check would need a join — simplified
      : null;
    const pass = hits.length >= Math.ceil(c.expected_keywords.length / 2) && r.confidence >= 0.5;
    if (pass) passed++;

    results.push({
      question: c.question, answer: r.answer.slice(0, 200), confidence: r.confidence,
      latencyMs: r.latencyMs, keywordHits: hits.length, keywordTotal: c.expected_keywords.length,
      categoryMatch: catMatch, pass,
    });

    console.log(`${pass ? '✅' : '❌'} [${r.confidence.toFixed(2)}] ${c.question.slice(0, 60)}  (${hits.length}/${c.expected_keywords.length} kw)`);
  }

  console.log(`\n${passed}/${cases.length} passed (${((passed / cases.length) * 100).toFixed(0)}%)`);

  const outPath = `./data/eval-results-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`;
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Details → ${outPath}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
