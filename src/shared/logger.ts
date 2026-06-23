import pino from 'pino';
import { getConfig } from './config.js';

const config = getConfig();

export const logger = pino({
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
  redact: {
    paths: ['*.api_key', '*.apiKey', '*.password', '*.token', '*.access_token'],
    censor: '[REDACTED]',
  },
});
