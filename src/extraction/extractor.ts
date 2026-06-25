import { callClaude } from '../shared/claude-client.js';
import { getConfig } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { ExtractionResult, ExtractionResultSchema, Thread } from '../shared/schemas.js';

const config = getConfig();

const EXTRACTION_SYSTEM_PROMPT = `You are extracting reusable Q&A pairs from a support email or chat thread for LendingGenie's knowledge base.

# Decide first: is this a Q&A thread?
Set is_qa_thread = false (and qa_pairs = []) if:
- Purely social/casual chat, status updates, no question asked
- Automated notifications, calendar invites, CI alerts
- Question is so customer-specific no general answer can be extracted
- No clear resolution was reached
- Gibberish or non-English

# Writing the question
- Rewrite into a generalized form a future searcher would type
- Strip names, account numbers, ticket IDs, dates
- Bad: "Can you check why John Smith account 88421 was charged twice?"
- Good: "Why might a customer be charged twice for a single transaction?"

# Writing the answer
- Distill the resolution into clear, reusable prose -- don't paste verbatim
- Include reasoning, steps, and caveats
- Strip specific people, Slack handles, ticket IDs
- Use markdown for steps or code blocks where helpful

# Category & tags
Category: short label like "credit-basics", "credit-score", "loan-eligibility", "loan-types", "repayment", "rates", "application"
Tags: 2-6 free-form keywords for retrieval

# Confidence (0.0-1.0)
- 0.9+: clean Q, definitive A, confirmed working
- 0.7-0.9: clear answer, might be context-specific
- 0.5-0.7: partial answer or inferred resolution
- <0.5: don't include -- return is_qa_thread=false instead

# PII rules -- non-negotiable
Never include: email addresses, phone numbers, postal addresses, credit card/bank numbers, government IDs, API keys, passwords. First names without last names are OK.

Return JSON only:
{ "is_qa_thread": boolean, "reason": string, "qa_pairs": [{ "question": string, "answer": string, "category": string | null, "tags": string[], "confidence": number }] }`;

export async function extractFromThread(thread: Thread): Promise<{ result: ExtractionResult; costUsd: number }> {
  const parts: string[] = [];
  parts.push(`# Source: ${thread.sourceKind} | Topic: ${thread.topic} | ${thread.messages.length} messages`);
  const MAX_BODY = 4000;
  for (const m of thread.messages) {
    parts.push(`\n--- ${m.isFromInternal ? '[US]' : '[THEM]'} ${m.fromName ?? m.from} @ ${m.sentAt.toISOString()} ---`);
    parts.push(m.body.length > MAX_BODY ? m.body.slice(0, MAX_BODY) + '\n[truncated]' : m.body);
  }
  parts.push('\nExtract Q&A pairs per the system prompt. Return JSON only.');

  const { data, costUsd } = await callClaude<ExtractionResult>({
    model: config.ANTHROPIC_MODEL_DEFAULT,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    userMessage: parts.join('\n'),
    maxTokens: 2048,
    responseSchema: ExtractionResultSchema,
    cacheSystem: true,
  });

  logger.debug({ threadId: thread.id, isQa: data.is_qa_thread, pairs: data.qa_pairs.length, costUsd: costUsd.toFixed(6) }, 'extraction done');
  return { result: data, costUsd };
}
