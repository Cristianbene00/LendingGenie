import pg from 'pg';
import { getConfig } from './config.js';
import { logger } from './logger.js';

const config = getConfig();

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => logger.error({ err }, 'idle pg client error'));
// NOTE: We deliberately do NOT call pgvector.registerType() on the pool's
// 'connect' event. pg does not await async 'connect' listeners, so the
// registerType query races the first real query on the same client, which
// throws "client is already executing a query" and crashes the request with
// an empty-body 500. We never read raw vector columns into JS — embeddings
// are written via a `$n::vector` cast from a JSON string, and reads only
// return computed similarity floats — so no type parser is required.

export async function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string, params?: unknown[],
): Promise<pg.QueryResult<R>> {
  const start = Date.now();
  try {
    const result = await pool.query<R>(text, params as never[]);
    logger.trace({ rows: result.rowCount, ms: Date.now() - start }, 'db');
    return result;
  } catch (err) {
    logger.error({ err, sql: text.split('\n')[0]?.slice(0, 80) }, 'pg fail');
    throw err;
  }
}

export async function withTransaction<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}
