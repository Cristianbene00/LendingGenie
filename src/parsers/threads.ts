import crypto from 'crypto';
import { NormalizedEmail } from './mbox.js';
import { ThreadMessage } from '../shared/schemas.js';

export interface ReconstructedThread {
  dedupKey: string;
  topic: string;
  messages: ThreadMessage[];
  participants: string[];
  earliestAt: Date;
  latestAt: Date;
}

export function reconstructThreads(emails: NormalizedEmail[], internalDomain: string | null): ReconstructedThread[] {
  const parent = new Map<string, string>();
  function find(x: string): string { let c = x; while (parent.get(c) && parent.get(c) !== c) c = parent.get(c)!; parent.set(x, c); return c; }
  function union(a: string, b: string) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); }

  for (const e of emails) {
    if (!parent.has(e.messageId)) parent.set(e.messageId, e.messageId);
    if (!parent.has(e.threadKey)) parent.set(e.threadKey, e.threadKey);
    union(e.messageId, e.threadKey);
    for (const ref of e.references) { if (!parent.has(ref)) parent.set(ref, ref); union(e.messageId, ref); }
  }

  const buckets = new Map<string, NormalizedEmail[]>();
  for (const e of emails) {
    const root = find(e.messageId);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root)!.push(e);
  }

  const out: ReconstructedThread[] = [];
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
    const messages: ThreadMessage[] = bucket.map((e) => ({
      messageId: e.messageId, from: e.from, fromName: e.fromName, sentAt: e.sentAt, body: e.body,
      isFromInternal: internalDomain !== null && e.from.toLowerCase().endsWith(`@${internalDomain.toLowerCase()}`),
    }));
    const topic = bucket[0]?.subject?.replace(/^(re:|fwd?:|fw:)\s*/gi, '').trim() ?? '(no subject)';
    const participants = Array.from(new Set(bucket.flatMap((e) => [e.from, ...e.to])));
    const h = crypto.createHash('sha256');
    for (const m of messages) { h.update(m.messageId); h.update(m.sentAt.toISOString()); }
    out.push({ dedupKey: `email:${h.digest('hex').slice(0, 32)}`, topic: topic.slice(0, 500), messages, participants, earliestAt: messages[0]!.sentAt, latestAt: messages[messages.length - 1]!.sentAt });
  }
  return out;
}
