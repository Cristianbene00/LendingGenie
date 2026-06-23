/**
 * One-time interactive Microsoft Teams login.
 * Run this in a foreground terminal: `npm run login:teams`
 *
 * It opens your browser, you sign in + consent once, and the token (with a
 * refresh token) is cached to .msal_cache.json. After that, the background
 * worker syncs Teams silently — no more browser popups.
 */
import { loginTeamsInteractive } from '../src/sync/teams.js';
import { logger } from '../src/shared/logger.js';

async function main() {
  await loginTeamsInteractive();
  logger.info('Done. You can now run a Teams sync from the web UI or `npm run sync:teams`.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
