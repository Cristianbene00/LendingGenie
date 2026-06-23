import Anthropic from '@anthropic-ai/sdk';
import { ZodSchema } from 'zod';
import { getConfig } from './config.js';
import { logger } from './logger.js';

const config = getConfig();
// Explicit per-request timeout + retries. Without these the SDK defaults to a
// 10-minute timeout, so a stalled connection can hang a worker job
// indefinitely (and the prefilter loop processes threads serially, so one
// hung call freezes the whole sync). 60s/3 retries fails fast and recovers.
const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 3 });

const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
};

function costOf(model: string, inp: number, out: number): number {
  const p = PRICING[model];
  return p ? (inp * p.input + out * p.output) / 1_000_000 : 0;
}

// Robustly pull a JSON object out of a model reply: strip ```json fences and
// fall back to the outermost { ... } span. Tolerates prose around the JSON.
function extractJson(s: string): string {
  let t = s.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);
  return t;
}

export interface CallResult<T> {
  data: T;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

interface CallOpts {
  model: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  responseSchema?: ZodSchema;
  cacheSystem?: boolean;
}

export async function callClaude<T = string>(opts: CallOpts): Promise<CallResult<T>> {
  const start = Date.now();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const sys: Anthropic.TextBlockParam[] = [{
        type: 'text', text: opts.systemPrompt,
        ...(opts.cacheSystem ? { cache_control: { type: 'ephemeral' } } : {}),
      }];
      // NOTE: We do NOT use assistant-message prefill (pushing { role:
      // 'assistant', content: '{' }) — current Claude models reject it
      // ("does not support assistant message prefill"). Instead we ask for
      // JSON in the prompt and robustly extract the object from the reply.
      const msgs: Anthropic.MessageParam[] = [{ role: 'user', content: opts.userMessage }];

      const resp = await client.messages.create({
        model: opts.model, max_tokens: opts.maxTokens ?? 2048, system: sys, messages: msgs,
      });

      const raw = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text).join('');

      let parsed: T;
      if (opts.responseSchema) {
        parsed = opts.responseSchema.parse(JSON.parse(extractJson(raw))) as T;
      } else {
        parsed = raw as T;
      }

      return {
        data: parsed,
        costUsd: costOf(opts.model, resp.usage.input_tokens, resp.usage.output_tokens),
        inputTokens: resp.usage.input_tokens,
        outputTokens: resp.usage.output_tokens,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      const status = (err as { status?: number }).status;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (!retryable || attempt === 3) { logger.error({ err, attempt }, 'claude fail'); throw err; }
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** (attempt - 1), 10_000)));
    }
  }
  throw new Error('unreachable');
}
