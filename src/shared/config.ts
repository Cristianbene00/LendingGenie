import 'dotenv/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  ANTHROPIC_MODEL_DEFAULT: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_MODEL_CLASSIFY: z.string().default('claude-haiku-4-5-20251001'),

  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY required'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(1536),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  MS_GRAPH_CLIENT_ID: z.string().optional(),
  MS_GRAPH_TENANT_ID: z.string().default('common'),
  TEAMS_ENG_CHANNEL: z.string().optional(),
  TEAMS_CHANNELS: z.string().optional(),

  INTERNAL_EMAIL_DOMAIN: z.string().default('lendinggenie.ai'),

  SUPPORT_BUSINESS_HOURS: z.string().default('Monday–Friday, 9:00 AM–6:00 PM ET'),

  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  API_PORT: z.coerce.number().default(3001),
  WEB_PORT: z.coerce.number().default(3000),

  UPLOAD_DIR: z.string().default('./data/uploads'),
  DAILY_SPEND_LIMIT_USD: z.coerce.number().default(50),
});

export type Config = z.infer<typeof ConfigSchema>;
let _config: Config | null = null;

export function getConfig(): Config {
  if (_config) return _config;
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid env config:', parsed.error.format());
    process.exit(1);
  }
  _config = parsed.data;
  return _config;
}
