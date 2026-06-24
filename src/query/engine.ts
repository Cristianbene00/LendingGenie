import { callClaude } from '../shared/claude-client.js';
import { getConfig } from '../shared/config.js';
import { query } from '../shared/db.js';
import { logger } from '../shared/logger.js';
import { z } from 'zod';
import { retrieve, RetrievalHit, recordOpenQuestion } from '../knowledge/store.js';
import { QueryAnswer } from '../shared/schemas.js';

const config = getConfig();
const CONFIDENCE_FLOOR = 0.6;

// ── Layer 1: zero-cost injection guard ───────────────────────
// Catches prompt-injection attempts before any model call.
// Patterns are conservative — prefer false negatives over blocking real support questions.
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

// ── Layer 2: Haiku pre-filter ────────────────────────────────
// Classifies intent in ~300 ms at ~1/100th the cost of a Sonnet call.
// Runs in PARALLEL with vector retrieval so it adds zero latency to in-scope queries.
// Greetings, escalation requests, and out-of-scope questions never reach Sonnet.
const PRE_FILTER_SYSTEM = `Classify inbound messages for LendingGenie's customer support chat.
LendingGenie provides merchant cash advances (MCAs) to U.S. gig workers and self-employed people.

Return the single JSON field "t" set to one of:
"ok"    – a genuine question about LendingGenie's advance, application, funding, repayment, fees, eligibility, or account
"hi"    – greeting, farewell, thanks, or aimless small talk
"agent" – user is asking for a human agent, expressing strong frustration, or is angry
"oos"   – anything unrelated to LendingGenie or our MCA product (general knowledge, other companies, coding, legal/medical advice not related to our product, etc.)

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
    logger.warn({ e }, 'pre-filter error — proceeding with full pipeline');
    return 'ok';
  }
}

// Human-sounding canned responses for non-product intents.
// These bypass retrieval and Sonnet entirely.
function cannedResponse(intent: 'hi' | 'agent' | 'oos'): string {
  const h = config.SUPPORT_BUSINESS_HOURS;
  switch (intent) {
    case 'hi':
      return "Hi there! Happy to help. Feel free to ask me anything about your LendingGenie cash advance, your account, or how our process works.";
    case 'agent':
      return `Of course, I completely understand. A member of our support team would be happy to assist you directly. We are available ${h}. You can also reply to any of our previous emails and someone will follow up with you shortly.`;
    case 'oos':
      return "That is a bit outside of what I can help with here. I am set up to answer questions about LendingGenie's cash advance products, accounts, applications, and funding. Is there something about your LendingGenie advance I can help with?";
  }
}

// ── Layer 3: RAG — retrieve, diversify, compress, generate ───

// Retrieve top-12 with a wider net (floor 0.45), then quality-gate and
// diversify before passing context to the model. This gives us more signal
// to work with while keeping the context window lean.
const RETRIEVE_CANDIDATES = 12;
const RETRIEVE_FLOOR = 0.45;
const QUALITY_FLOOR = 0.60;   // minimum similarity to include in the context
const CTX_HITS = 4;           // max entries passed to the model
const CTX_ANSWER_CHARS = 420; // truncate long answers to ~110 tokens each

// MMR-lite: select up to k diverse hits, capping category representation at 2.
// Prevents the model from seeing near-duplicate entries on the same subtopic.
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
  // Back-fill if not enough diverse hits (edge case with very narrow KBs)
  for (const h of hits) {
    if (selected.length >= k) break;
    if (!selected.includes(h)) selected.push(h);
  }
  return selected;
}

const ANSWER_SYSTEM = `You are the LendingGenie support assistant, a warm and professional member of our support team. You sound like a thoughtful, calm, genuinely helpful human.

ABOUT LENDINGGENIE:
LendingGenie provides merchant cash advances (MCAs): fast funding of up to $5,000 for U.S. gig workers, 1099 / self-employed individuals, and small business owners. Approval is earnings-based with only a soft credit pull. The application uses a secure bank connection (Plaid) plus a government ID. Decisions take minutes and approved funds arrive within about 24 hours via ACH. An MCA is not a traditional loan.

VOICE & STYLE:
- "you" for the customer, "we" / "our team" for LendingGenie.
- Friendly, empathetic, concise. Lead with the answer, then any next step.
- Plain conversational text. No Markdown (no bold, #, bullets). Number steps as 1. 2. 3.
- NEVER use em dashes. Use commas, periods, or parentheses instead.
- Never mention "knowledge base", "retrieved context", "qa_id", or confidence scores.
- Keep answers short (2-4 sentences). Customers are reading on a phone.

GROUNDING (critical for a fintech company):
- State LendingGenie-specific facts only if they appear in the CONTEXT below or the ABOUT section above.
- Never invent specifics. For anything involving money, accounts, exact terms, or compliance, say you do not have that detail and point them to our team.
- When context is insufficient: acknowledge warmly, say you do not have that specific detail, offer our support hours: ${config.SUPPORT_BUSINESS_HOURS}.

Confidence scale: 0.85+ = clear match; 0.60–0.85 = partial; below 0.60 = weak.

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

  // ── Guard: block injection attempts ──────────────────────
  if (isInjection(q)) {
    logger.warn({ intent: 'injection' }, 'blocked injection attempt');
    const answer = "I can only help with questions about LendingGenie's products and accounts. What can I help you with today?";
    const queryId = await logQuery({ queryText: '[REDACTED]', userEmail: opts.userEmail, hitIds: [], answer, citations: [], confidence: 1, sufficientContext: true, costUsd: 0, latencyMs: Date.now() - start });
    return { answer, confidence: 1, citations: [], sufficientContext: true, escalation: false, costUsd: 0, latencyMs: Date.now() - start, queryId };
  }

  // ── Pre-filter + retrieval run in parallel ────────────────
  // classifyIntent uses Haiku (~300 ms). retrieve() hits Postgres (~150 ms).
  // Running both simultaneously means in-scope queries pay zero extra latency
  // for the pre-filter, while OOS/greeting queries skip Sonnet entirely.
  const [intent, candidates] = await Promise.all([
    classifyIntent(q),
    retrieve(q, RETRIEVE_CANDIDATES, RETRIEVE_FLOOR),
  ]);
  logger.info({ q: q.slice(0, 80), intent, candidates: candidates.length }, 'pre-filter + retrieval done');

  // ── Canned response for non-product intents ───────────────
  if (intent !== 'ok') {
    const answer = deEmDash(cannedResponse(intent));
    const queryId = await logQuery({ queryText: q, userEmail: opts.userEmail, hitIds: [], answer, citations: [], confidence: 1, sufficientContext: true, costUsd: 0, latencyMs: Date.now() - start });
    return { answer, confidence: 1, citations: [], sufficientContext: true, escalation: intent === 'agent', costUsd: 0, latencyMs: Date.now() - start, queryId };
  }

  // ── Select diverse, high-quality hits ────────────────────
  const qualified = candidates.filter((h) => h.similarity >= QUALITY_FLOOR);
  // If too few pass the quality gate, fall back to the top raw candidates
  const pool = qualified.length >= 2 ? qualified : candidates.slice(0, CTX_HITS);
  const hits = selectDiverse(pool, opts.topK ?? CTX_HITS);

  // ── Build compact context window ─────────────────────────
  // Each entry is truncated to CTX_ANSWER_CHARS to keep input tokens low
  // while still giving the model enough signal to ground its answer.
  const parts: string[] = [`# Question\n${q}\n`];
  if (hits.length === 0) {
    parts.push('# Context\n(No relevant KB entries found for this question.)');
  } else {
    parts.push(`# Context (${hits.length} entries, ranked by relevance)`);
    for (const h of hits) {
      const ans = h.answer.length > CTX_ANSWER_CHARS ? `${h.answer.slice(0, CTX_ANSWER_CHARS)}…` : h.answer;
      parts.push(`\n## qaId:${h.qaId}${h.category ? ` [${h.category}]` : ''} sim:${h.similarity.toFixed(2)}\nQ: ${h.question}\nA: ${ans}`);
    }
  }
  parts.push('\nAnswer as LendingGenie support. Return JSON only.');

  // Adaptive output budget: strong retrieval match → shorter answer is fine.
  // Cuts average output tokens by ~60% vs the old 1024 ceiling.
  const topSim = hits[0]?.similarity ?? 0;
  const maxTokens = topSim >= 0.85 ? 260 : topSim >= 0.65 ? 320 : 380;

  // ── Generate answer ───────────────────────────────────────
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

  // Bank knowledge gaps — only genuine product questions that lacked good answers.
  // Greetings/OOS/escalations are already handled above and never reach here.
  if (!answer.escalation && (!answer.sufficientContext || answer.confidence < CONFIDENCE_FLOOR)) {
    const reason = hits.length === 0 ? 'no_matching_context'
      : !answer.sufficientContext ? 'insufficient_context' : 'low_confidence';
    await recordOpenQuestion({ question: q, queryId, askedBy: opts.userEmail, reason, bestConfidence: answer.confidence })
      .catch((e) => logger.warn({ e }, 'failed to record open question'));
  }

  return { ...answer, costUsd, latencyMs: Date.now() - start, queryId };
}
