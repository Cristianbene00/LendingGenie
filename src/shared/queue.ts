import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { getConfig } from './config.js';
import { logger } from './logger.js';

const config = getConfig();
export const redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

export const MBOX_QUEUE = 'mbox-processing';
export const TEAMS_QUEUE = 'teams-sync';
export const EXTRACT_QUEUE = 'qa-extraction';
export const EMBED_QUEUE = 'embedding';

const jobOpts = { attempts: 3, backoff: { type: 'exponential' as const, delay: 10_000 },
  removeOnComplete: { age: 24 * 3600, count: 500 }, removeOnFail: { age: 7 * 24 * 3600 } };

export const mboxQueue = new Queue<{ uploadId: string; filePath: string }>(MBOX_QUEUE, { connection: redis, defaultJobOptions: jobOpts });
export const teamsQueue = new Queue<{ syncId: string; since: string | null; channelLabel: string }>(TEAMS_QUEUE, { connection: redis, defaultJobOptions: jobOpts });
export const extractQueue = new Queue<{ threadId: string }>(EXTRACT_QUEUE, { connection: redis, defaultJobOptions: jobOpts });
export const embedQueue = new Queue<{ trigger: string }>(EMBED_QUEUE, { connection: redis, defaultJobOptions: jobOpts });

// NOTE: BullMQ custom job IDs must NOT contain ':' (it's Redis's key
// separator) — newer versions throw "Custom Id cannot contain :". Use '-'.
export async function enqueueMboxProcessing(uploadId: string, filePath: string) {
  await mboxQueue.add('mbox', { uploadId, filePath }, { jobId: `mbox-${uploadId}` });
  logger.info({ uploadId }, 'enqueued mbox');
}
export async function enqueueTeamsSync(syncId: string, since: string | null, channelLabel: string) {
  await teamsQueue.add('sync', { syncId, since, channelLabel }, { jobId: `sync-${syncId}` });
}
export async function enqueueExtraction(threadId: string) {
  await extractQueue.add('extract', { threadId }, { jobId: `extract-${threadId}` });
}
export async function enqueueEmbedBatch() {
  await embedQueue.add('batch', { trigger: 'batch' }, { jobId: `embed-${Date.now()}` });
}

export function startWorkers(handlers: {
  mbox: (d: { uploadId: string; filePath: string }) => Promise<void>;
  teams: (d: { syncId: string; since: string | null; channelLabel: string }) => Promise<void>;
  extract: (d: { threadId: string }) => Promise<void>;
  embed: (d: { trigger: string }) => Promise<void>;
}): Worker[] {
  const ws = [
    new Worker(MBOX_QUEUE, async (j) => handlers.mbox(j.data), { connection: redis, concurrency: 1 }),
    new Worker(TEAMS_QUEUE, async (j) => handlers.teams(j.data), { connection: redis, concurrency: 1 }),
    new Worker(EXTRACT_QUEUE, async (j) => handlers.extract(j.data), { connection: redis, concurrency: 5 }),
    new Worker(EMBED_QUEUE, async (j) => handlers.embed(j.data), { connection: redis, concurrency: 1 }),
  ];
  for (const w of ws) {
    w.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'job failed'));
  }
  return ws;
}
