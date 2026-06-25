import { callClaude } from '../shared/claude-client.js';
import { getConfig } from '../shared/config.js';
import { query } from '../shared/db.js';
import { logger } from '../shared/logger.js';
import { z } from 'zod';
import { retrieve, RetrievalHit, recordOpenQuestion } from '../knowledge/store.js';
import { QueryAnswer } from '../shared/schemas.js';

const config = getConfig();
const CONFIDENCE_FLOOR = 0.6;

const INJECTION_RX = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /\byou\s+are\s+now\s+(a|an)\s+/i,
  /\bpretend\s+(you\s+are|to\s+be)\s+/i,
  /\bforget\s+(everything|all)\s+(you|your|all\s+previous)/i,
  /\bDAN\s+mode\b/i,
  /\bjailbreak\b/i,
  /\bnew\s+(persona|character|role)\b/i,
];
function isInjection(q: string): boolean {
  return INJECTION_RX.some((rx) => rx.test(q));
}

const PRE_FILTER_SYSTEM = `Classify inbound messages for LendingGenie's AI assistant chat.
LendingGenie helps users understand their credit situation, improve their credit score, and find suitable loan products.

Return the single JSON field "t" set to one of:
"ok"    - a genuine question about credit scores, credit reports, loan eligibility, interest rates, debt, loan types, repayment, or financial health
"hi"    - greeting, farewell, thanks, or aimless small talk
"agent" - user is asking for a human agent, expressing strong frustration, or is angry
"oos"   - anything unrelated to credit, loans, or personal finance

Return JSON only: {"t":"ok"|"hi"|"agent"|"oos"}`;

const PreFilterSchema = z.object({ t: z.enum(['ok', 'hi', 'agent', 'oos']) });

async function classifyIntent(q: string): Promise<'ok' | 'hi' | 'agent' | 'oos'> {
  try {
    const { data } = await callClaude<z.infer<typeof PreFilterSchema>>({
      model: config.ANTHROPIC_MODEL_CLASSIFY,
      systemPrompt: PRE_FILTER_SYSTEM,
      userMessage: q,
      maxTokens: 15,
      responseSchema: PreFilterSchema,
      cacheSystem: true,
    });
    return data.t;
  } catch (e) {
    logger.warn({ e }, 'pre-filter error - proceeding with full pipeline');
    return 'ok';
  }
}

function cannedResponse(intent: 'hi' | 'agent' | 'oos'): string {
  const h = config.SUPPORT_BUSINESS_HOURS;
  switch (intent) {
    case 'hi':
      return "Hi there! I am LendingGenie, your AI credit and loan assistant. Feel free to ask me anything about your credit score, improving your credit, loan options, or how to qualify for better rates.";
    case 'agent':
      return `Of course, I completely understand. A member of our team would be happy to assist you directly. We are available ${h}. You can also reach us through the contact form and someone will follow up with you shortly.`;
    case 'oos':
      return "That is a bit outside of what I can help with here. I am set up to answer questions about credit scores, credit reports, loan options, and personal finance. Is there something about your credit or a loan I can help with?";
  }
}

const RETRIEVE_CANDIDATES = 12;
const RETRIEVE_FLOOR = 0.45;
const QUALITY_FLOOR = 0.60;
const CTX_HITS = 4;
const CTX_ANSWER_CHARS = 420;

function selectDiverse(hits: RetrievalHit[], k: number): RetrievalHit[] {
  const selected: RetrievalHit[] = [];
  const catCount: Record<string, number> = {};
  for (const h of hits) {
    if (selected.length >= k) break;
    const cat = h.category ?? '_';
    if ((catCount[cat] ?? 0) >= 2) continue;
    selected.push(h);
    catCount[cat] = (catCount[cat] ?? 0) + 1;
  }
  for (const h of hits) {
    if (selected.length >= k) break;
    if (!selected.includes(h)) selected.push(h);
  }
  return selected;
}

const ANSWER_SYSTEM = `You are LendingGenie, a warm and knowledgeable AI credit and loan assistant.

ABOUT LENDINGGENIE:
LendingGenie helps users understand their credit situation, improve their credit scores, and find loan products that match their financial profile.

VOICE & STYLE:
- "you" for the user, "we" / "our team" for LendingGenie.
- Friendly, empathetic, concise. Lead with the answer, then any next step.
- Plain conversational text. No Markdown. Number steps as 1. 2. 3.
- NEVER use em dashes.
- Keep answers short (2-4 sentences).

GROUNDING:
- Never invent specific rates, terms, or loan amounts.
- When context is insufficient, offer our support hours: ${config.SUPPORT_BUSINESS_HOURS}.

Return JSON only: { "answer": string, "confidence": number, "citations": [{"qaId": string, "question": string, "similarity": number}], "sufficient_context": boolean, "escalation": boolean }`;

const AnswerSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  citations: z.array(z.object({ qaId: z.string(), question: z.string(), similarity: z.number() })),
  sufficient_context: z.boolean(),
  escalation: z.boolean().optional().default(false),
});

function deEmDash(s: string): string {
  return s.replace(/\s*—\s*/g, ', ').replace(/—/g, '-');
}

async function logQuery(opts: {
  queryText: string; userEmail?: string; hitIds: string[]; answer: string;
  citations: object; confidence: number; sufficientContext: boolean; costUsd: number; latencyMs: number;
}): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO query_log (query_text, user_email, retrieved_qa_ids, answer, citations, confidence, sufficient_context, cost_usd, latency_ms)
     VALUES ($1,$2,$3::uuid[],$4,$5::jsonb,$6,$7,$8,$9) RETURNING id`,
    [opts.queryText, opts.userEmail ?? null, opts.hitIds, opts.answer,
     JSON.stringify(opts.citations), opts.confidence, opts.sufficientContext, opts.costUsd, opts.latencyMs]);
  return rows[0]!.id;
}

export async function ask(
  question: string,
  opts: { userEmail?: string; topK?: number } = {}
): Promise<QueryAnswer & { costUsd: number; latencyMs: number; queryId: string }> {
  const start = Date.now();
  const q = question.trim().replace(/\s+/g, ' ');

  if (isInjection(q)) {
    logger.warn({ intent: 'injection' }, 'blocked injection attempt');
    const answer = "I can only help with questions about credit, loans, and personal finance. What can I help you with today?";
    const queryId = await logQuery({ queryText: '[REDACTED]', userEmail: opts.userEmail, hitIds: [], answer, citations: [], confidence: 1, sufficientContext: true, costUsd: 0, latencyMs: Date.now() - start });
    return { answer, confidence: 1, citations: [], sufficientContext: true, escalation: false, costUsd: 0, latencyMs: Date.now() - start, queryId };
  }

  const [intent, candidates] = await Promise.all([
    classifyIntent(q),
    retrieve(q, RETRIEVE_CANDIDATES, RETRIEVE_FLOOR),
  ]);
  logger.info({ q: q.slice(0, 80), intent, candidates: candidates.length }, 'pre-filter + retrieval done');

  if (intent !== 'ok') {
    const answer = deEmDash(cannedResponse(intent));
    const queryId = await logQuery({ queryText: q, userEmail: opts.userEmail, hitIds: [], answer, citations: [], confidence: 1, sufficientContext: true, costUsd: 0, latencyMs: Date.now() - start });
    return { answer, confidence: 1, citations: [], sufficientContext: true, escalation: intent === 'agent', costUsd: 0, latencyMs: Date.now() - start, queryId };
  }

  const qualified = candidates.filter((h) => h.similarity >= QUALITY_FLOOR);
  const pool = qualified.length >= 2 ? qualified : candidates.slice(0, CTX_HITS);
  const hits = selectDiverse(pool, opts.topK ?? CTX_HITS);

  const parts: string[] = [`# Question\n${q}\n`];
  if (hits.length === 0) {
    parts.push('# Context\n(No relevant KB entries found for this question.)');
  } else {
    parts.push(`# Context (${hits.length} entries, ranked by relevance)`);
    for (const h of hits) {
      const ans = h.answer.length > CTX_ANSWER_CHARS ? `${h.answer.slice(0, CTX_ANSWER_CHARS)}...` : h.answer;
      parts.push(`\n## qaId:${h.qaId}${h.category ? ` [${h.category}]` : ''} sim:${h.similarity.toFixed(2)}\nQ: ${h.question}\nA: ${ans}`);
    }
  }
  parts.push('\nAnswer as LendingGenie assistant. Return JSON only.');

  const topSim = hits[0]?.similarity ?? 0;
  const maxTokens = topSim >= 0.85 ? 260 : topSim >= 0.65 ? 320 : 380;

  const { data, costUsd } = await callClaude<z.infer<typeof AnswerSchema>>({
    model: config.ANTHROPIC_MODEL_DEFAULT,
    systemPrompt: ANSWER_SYSTEM,
    userMessage: parts.join('\n'),
    maxTokens,
    responseSchema: AnswerSchema,
    cacheSystem: true,
  });

  const answer: QueryAnswer = {
    answer: deEmDash(data.answer),
    confidence: data.confidence,
    citations: data.citations,
    sufficientContext: data.sufficient_context,
    escalation: data.escalation,
  };

  const queryId = await logQuery({
    queryText: q, userEmail: opts.userEmail,
    hitIds: hits.map((h) => h.qaId),
    answer: answer.answer, citations: answer.citations,
    confidence: answer.confidence, sufficientContext: answer.sufficientContext ?? false,
    costUsd, latencyMs: Date.now() - start,
  });

  if (!answer.escalation && (!answer.sufficientContext || answer.confidence < CONFIDENCE_FLOOR)) {
    const reason = hits.length === 0 ? 'no_matching_context'
      : !answer.sufficientContext ? 'insufficient_context' : 'low_confidence';
    await recordOpenQuestion({ question: q, queryId, askedBy: opts.userEmail, reason, bestConfidence: answer.confidence })
      .catch((e) => logger.warn({ e }, 'failed to record open question'));
  }

  return { ...answer, costUsd, latencyMs: Date.now() - start, queryId };
}
