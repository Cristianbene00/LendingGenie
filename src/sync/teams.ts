import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PublicClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { callClaude } from '../shared/claude-client.js';
import { getConfig } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { z } from 'zod';
import { ThreadMessage } from '../shared/schemas.js';

const config = getConfig();

// ─── Auth: user-consent flow (no admin, no secret) ───────────
//
// Design: the INTERACTIVE login (browser popup) only runs via the dedicated
// foreground command `npm run login:teams`, so the loopback redirect server
// stays alive until you finish signing in. The token cache is persisted to
// disk (.msal_cache.json), so once you log in, EVERY process — including the
// background worker — acquires tokens SILENTLY from the refresh token. The
// worker never opens a browser; if it isn't authenticated it throws a clear
// error telling you to run the login command.

const MSAL_CACHE_PATH = path.resolve('.msal_cache.json');
const SCOPES = ['ChannelMessage.Read.All', 'Team.ReadBasic.All'];

const cachePlugin = {
  beforeCacheAccess: async (ctx: { tokenCache: { deserialize: (s: string) => void } }) => {
    try {
      if (fs.existsSync(MSAL_CACHE_PATH)) ctx.tokenCache.deserialize(fs.readFileSync(MSAL_CACHE_PATH, 'utf8'));
    } catch (err) { logger.warn({ err }, 'msal cache read failed'); }
  },
  afterCacheAccess: async (ctx: { cacheHasChanged: boolean; tokenCache: { serialize: () => string } }) => {
    try {
      if (ctx.cacheHasChanged) fs.writeFileSync(MSAL_CACHE_PATH, ctx.tokenCache.serialize());
    } catch (err) { logger.warn({ err }, 'msal cache write failed'); }
  },
};

let _pca: PublicClientApplication | null = null;
function getPca(): PublicClientApplication {
  if (!config.MS_GRAPH_CLIENT_ID) throw new Error('MS_GRAPH_CLIENT_ID required. See TEAMS_SETUP.md.');
  if (!_pca) {
    _pca = new PublicClientApplication({
      auth: { clientId: config.MS_GRAPH_CLIENT_ID, authority: `https://login.microsoftonline.com/${config.MS_GRAPH_TENANT_ID}` },
      cache: { cachePlugin },
    });
  }
  return _pca;
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

// Acquire a token silently from the persisted cache / refresh token. Returns
// null if there is no usable cached account (i.e. login is required).
async function acquireSilent(): Promise<string | null> {
  const pca = getPca();
  const accounts = await pca.getTokenCache().getAllAccounts();
  if (accounts.length === 0) return null;
  try {
    const result = await pca.acquireTokenSilent({ account: accounts[0]!, scopes: SCOPES });
    if (result?.accessToken) {
      cachedToken = { accessToken: result.accessToken, expiresAt: result.expiresOn?.getTime() ?? Date.now() + 3600_000 };
      return result.accessToken;
    }
  } catch (err) { logger.warn({ err }, 'silent token acquisition failed'); }
  return null;
}

async function getGraphClient(): Promise<Client> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60_000) {
    return Client.init({ authProvider: (done) => done(null, cachedToken!.accessToken) });
  }
  const token = await acquireSilent();
  if (!token) {
    throw new Error('Teams not authenticated. Run `npm run login:teams` once to sign in, then retry the sync.');
  }
  return Client.init({ authProvider: (done) => done(null, token) });
}

// Interactive browser login. ONLY call this from a foreground terminal
// (npm run login:teams) — not from the background worker.
export async function loginTeamsInteractive(): Promise<void> {
  const pca = getPca();
  if (await acquireSilent()) { logger.info('Teams: already authenticated (cached token still valid).'); return; }
  logger.info('Teams: opening browser for login…');
  const result = await pca.acquireTokenInteractive({
    scopes: SCOPES,
    openBrowser: async (url) => {
      const { exec } = await import('child_process');
      // The OAuth URL contains '&', which cmd.exe treats as a command
      // separator (truncating the URL → AADSTS900144). Wrap it in double
      // quotes so cmd passes it as a single argument. `start` needs an
      // empty "" title arg first on Windows.
      const cmd = process.platform === 'win32' ? `start "" "${url}"`
        : process.platform === 'darwin' ? `open "${url}"`
        : `xdg-open "${url}"`;
      exec(cmd);
      logger.info(`If the browser didn't open, paste this URL:\n${url}`);
    },
  });
  if (!result?.accessToken) throw new Error('Teams login failed — no token received.');
  logger.info('Teams: login successful — token cached to .msal_cache.json. Future syncs are silent.');
}

// ─── Fetch threads ───────────────────────────────────────────

// Diagnostic: raw Graph call with a hard timeout, to isolate hangs.
export async function debugChannelFetch(): Promise<void> {
  const [teamId, channelId] = (config.TEAMS_ENG_CHANNEL ?? '').split(':');
  console.log('teamId   =', teamId);
  console.log('channelId=', channelId);
  const token = await acquireSilent();
  if (!token) { console.log('NO TOKEN — run npm run login:teams'); return; }
  console.log('token acquired, length', token.length);
  const url = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages?$top=2`;
  console.log('GET', url);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    const body = await resp.text();
    console.log('STATUS', resp.status);
    console.log('BODY', body.slice(0, 1000));
  } catch (e) {
    console.log('FETCH ERROR/TIMEOUT:', String(e));
  } finally { clearTimeout(t); }
}

interface RawTeamsMsg {
  id: string;
  replyToId: string | null;
  createdDateTime: string;
  from?: { user?: { id?: string; displayName?: string } };
  body?: { contentType?: string; content?: string };
  replies?: RawTeamsMsg[];
}

export interface TeamsThread {
  dedupKey: string;
  topic: string;
  messages: ThreadMessage[];
  participants: string[];
  earliestAt: Date;
  latestAt: Date;
}

// Raw Graph GET with a hard timeout + basic 429 (throttling) handling.
// We use fetch directly instead of @microsoft/microsoft-graph-client: that
// SDK hangs indefinitely on .get() under newer Node (no response, no timeout).
async function graphGet(url: string, token: string): Promise<any> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
      if (resp.status === 429 || resp.status >= 500) {
        const retryAfter = Number(resp.headers.get('retry-after')) || Math.min(2 ** attempt, 30);
        logger.warn({ status: resp.status, retryAfter, attempt }, 'Graph throttled/5xx — backing off');
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      if (!resp.ok) throw new Error(`Graph ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
      return await resp.json();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        logger.warn({ attempt, url: url.slice(0, 100) }, 'Graph request timed out — retrying');
        if (attempt === 4) throw new Error('Graph request timed out after retries');
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Graph request failed after retries');
}

export interface TeamsChannel { label: string; teamId: string; channelId: string; }

// Parse configured channels. Prefers TEAMS_CHANNELS (multi, labeled);
// falls back to the single TEAMS_ENG_CHANNEL labeled "Engineers".
export function getTeamsChannels(): TeamsChannel[] {
  const out: TeamsChannel[] = [];
  const raw = config.TEAMS_CHANNELS?.trim();
  if (raw) {
    for (const part of raw.split(';')) {
      const p = part.trim();
      if (!p) continue;
      const bar = p.indexOf('|');
      const label = bar >= 0 ? p.slice(0, bar).trim() : 'Teams';
      const rest = (bar >= 0 ? p.slice(bar + 1) : p).trim();
      const ci = rest.indexOf(':'); // teamId is a UUID (no colon); split on first ':'
      const teamId = rest.slice(0, ci).trim();
      const channelId = rest.slice(ci + 1).trim();
      if (teamId && channelId) out.push({ label, teamId, channelId });
    }
  } else if (config.TEAMS_ENG_CHANNEL) {
    const ci = config.TEAMS_ENG_CHANNEL.indexOf(':');
    out.push({ label: 'Engineers', teamId: config.TEAMS_ENG_CHANNEL.slice(0, ci), channelId: config.TEAMS_ENG_CHANNEL.slice(ci + 1) });
  }
  return out;
}

export async function fetchTeamsThreads(teamId: string, channelId: string, sinceIso: string | null): Promise<TeamsThread[]> {
  if (!teamId || !channelId) throw new Error('teamId and channelId required');

  const token = await acquireSilent();
  if (!token) throw new Error('Teams not authenticated. Run `npm run login:teams` once, then retry.');

  // Smaller pages keep each $expand=replies response fast enough to avoid
  // timeouts and Graph throttling. Cap pages as a safety net for huge channels.
  const MAX_PAGES = 200;
  const base = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages?$expand=replies&$top=20`;
  const filter = sinceIso ? `&$filter=${encodeURIComponent(`lastModifiedDateTime gt ${sinceIso}`)}` : '';
  let pageUrl: string | undefined = base + filter;

  const threads: TeamsThread[] = [];
  let pages = 0;
  while (pageUrl) {
    const resp = await graphGet(pageUrl, token);
    for (const root of (resp.value ?? []) as RawTeamsMsg[]) {
      const t = buildThread(root, teamId, channelId);
      if (t) threads.push(t);
    }
    pageUrl = resp['@odata.nextLink'];
    pages++;
    logger.info({ pages, threadsSoFar: threads.length }, 'Teams page fetched');
    if (pages >= MAX_PAGES) { logger.warn({ pages }, 'hit MAX_PAGES cap — stopping pagination'); break; }
  }

  logger.info({ count: threads.length }, 'fetched Teams threads');
  return threads;
}

function buildThread(root: RawTeamsMsg, teamId: string, channelId: string): TeamsThread | null {
  const rootBody = textOf(root);
  if (!rootBody.trim()) return null;
  const messages: ThreadMessage[] = [];
  push(messages, root, rootBody);
  for (const reply of root.replies ?? []) { const b = textOf(reply); if (b.trim()) push(messages, reply, b); }
  if (messages.length < 2) return null;
  messages.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  const participants = [...new Set(messages.map((m) => m.from))];
  const h = crypto.createHash('sha256'); for (const m of messages) h.update(m.messageId);
  return { dedupKey: `teams:${teamId}:${channelId}:${root.id}:${h.digest('hex').slice(0, 16)}`, topic: rootBody.slice(0, 200), messages, participants, earliestAt: messages[0]!.sentAt, latestAt: messages.at(-1)!.sentAt };
}

function push(out: ThreadMessage[], raw: RawTeamsMsg, body: string) {
  out.push({ messageId: raw.id, from: raw.from?.user?.id ?? 'system', fromName: raw.from?.user?.displayName ?? null, sentAt: new Date(raw.createdDateTime), body, isFromInternal: false });
}

function textOf(msg: RawTeamsMsg): string {
  const c = msg.body?.content ?? '';
  return msg.body?.contentType === 'html' ? c.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() : c.trim();
}

// ─── Q&A prefilter (Haiku — cheap) ──────────────────────────

const QaPrefilterSchema = z.object({ is_qa_shaped: z.boolean(), reason: z.string() });

const PREFILTER_PROMPT = `Decide if a Teams channel thread is a question that got answered.
Return JSON: { "is_qa_shaped": boolean, "reason": string }
true if: someone asked a technical/procedural question AND got a substantive answer.
false if: casual chat, status updates, FYIs, polls, bot/CI noise, unanswered questions, meeting scheduling.`;

export async function prefilterIsQaShaped(thread: TeamsThread): Promise<{ pass: boolean; reason: string; costUsd: number }> {
  const compact = thread.messages.map((m, i) => `[${i}] ${m.fromName ?? 'user'}: ${m.body.slice(0, 200)}`).join('\n');
  const { data, costUsd } = await callClaude<{ is_qa_shaped: boolean; reason: string }>({
    model: config.ANTHROPIC_MODEL_CLASSIFY,
    systemPrompt: PREFILTER_PROMPT,
    userMessage: compact,
    maxTokens: 256,
    responseSchema: QaPrefilterSchema,
    cacheSystem: true,
  });
  return { pass: data.is_qa_shaped, reason: data.reason, costUsd };
}
