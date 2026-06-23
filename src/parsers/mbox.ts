import fs from 'fs';
import readline from 'readline';
import { simpleParser, ParsedMail } from 'mailparser';
import { logger } from '../shared/logger.js';

export interface RawEmail { parsed: ParsedMail; byteOffset: number; }

export async function* iterateMbox(filePath: string): AsyncGenerator<RawEmail> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let buffer: string[] = [];
  let currentOffset = 0;
  let messageStartOffset = 0;
  const FROM_LINE = /^From [^\s]+@[^\s]+\s/;
  let firstLine = true;

  for await (const line of rl) {
    const lineBytes = Buffer.byteLength(line, 'utf8') + 1;
    if (FROM_LINE.test(line) && !firstLine) {
      const raw = buffer.join('\n');
      if (raw.trim().length > 0) {
        try { const p = await simpleParser(raw); yield { parsed: p, byteOffset: messageStartOffset }; }
        catch (err) { logger.warn({ err, offset: messageStartOffset }, 'mbox parse skip'); }
      }
      buffer = [];
      messageStartOffset = currentOffset;
    }
    if (!FROM_LINE.test(line)) buffer.push(line);
    else if (firstLine) messageStartOffset = 0;
    firstLine = false;
    currentOffset += lineBytes;
  }

  if (buffer.length > 0) {
    const raw = buffer.join('\n');
    if (raw.trim().length > 0) {
      try { const p = await simpleParser(raw); yield { parsed: p, byteOffset: messageStartOffset }; }
      catch (err) { logger.warn({ err }, 'mbox parse final skip'); }
    }
  }
}

export interface NormalizedEmail {
  messageId: string;
  threadKey: string;
  references: string[];
  from: string;
  fromName: string | null;
  to: string[];
  subject: string;
  body: string;
  sentAt: Date;
}

export function normalizeEmail(raw: ParsedMail, internalDomain: string | null): NormalizedEmail | null {
  const messageId = raw.messageId ?? `synth-${Date.now()}-${Math.random()}`;
  const subject = (raw.subject ?? '').trim();
  if (/^(out of office|undeliverable|delivery status)/i.test(subject)) return null;

  let body = raw.text ?? '';
  if (!body && raw.html) body = stripHtml(typeof raw.html === 'string' ? raw.html : '');
  body = stripQuotedReplies(body);
  if (body.trim().length < 10) return null;

  const refs: string[] = [];
  if (raw.inReplyTo) refs.push(raw.inReplyTo);
  if (raw.references) { if (Array.isArray(raw.references)) refs.push(...raw.references); else refs.push(raw.references); }
  const threadKey = refs[0] ?? `subject:${subject.replace(/^(re:|fwd?:|fw:)\s*/gi, '').trim().toLowerCase()}`;

  const fromAddr = raw.from?.value?.[0];
  const from = fromAddr?.address ?? 'unknown';
  const fromName = fromAddr?.name?.trim() || null;
  if (internalDomain && from.toLowerCase() === `noreply@${internalDomain}`) return null;

  const to = (raw.to?.value ?? []).map((a) => a.address ?? '').filter(Boolean) as string[];
  return { messageId, threadKey, references: refs, from, fromName, to, subject, body, sentAt: raw.date ?? new Date() };
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim();
}

export function stripQuotedReplies(text: string): string {
  const lines = text.split('\n');
  let cutAt = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]!.trim();
    if (/^On .{1,60} wrote:$/.test(ln)) { cutAt = i; break; }
    if (/^[-_]{5,}$/.test(ln)) { cutAt = i; break; }
    if (/^-----Original Message-----/.test(ln)) { cutAt = i; break; }
    if (/^From: .*<.+@.+>/.test(ln) && lines[i + 1]?.startsWith('Sent: ')) { cutAt = i; break; }
  }
  return lines.slice(0, cutAt).join('\n').trim();
}
