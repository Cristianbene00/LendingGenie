import { z } from 'zod';

export const ThreadMessageSchema = z.object({
  messageId: z.string(),
  from: z.string(),
  fromName: z.string().nullable(),
  sentAt: z.coerce.date(),
  body: z.string(),
  isFromInternal: z.boolean(),
});
export type ThreadMessage = z.infer<typeof ThreadMessageSchema>;

export const ThreadSchema = z.object({
  id: z.string().uuid(),
  sourceKind: z.enum(['email', 'teams']),
  topic: z.string(),
  messages: z.array(ThreadMessageSchema),
  participants: z.array(z.string()),
  earliestAt: z.date().nullable(),
  latestAt: z.date().nullable(),
  dedupKey: z.string(),
});
export type Thread = z.infer<typeof ThreadSchema>;

export const ExtractionResultSchema = z.object({
  is_qa_thread: z.boolean(),
  reason: z.string(),
  qa_pairs: z.array(z.object({
    question: z.string().min(1),
    answer: z.string().min(1),
    category: z.string().nullable(),
    tags: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  })),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export const QueryAnswerSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  citations: z.array(z.object({
    qaId: z.string().uuid(),
    question: z.string(),
    similarity: z.number(),
  })),
  sufficientContext: z.boolean(),
  // True when the reply is a human-handoff / greeting / small-talk rather than
  // a knowledge answer — used to keep these out of the Open Questions bank.
  escalation: z.boolean().optional(),
});
export type QueryAnswer = z.infer<typeof QueryAnswerSchema>;
