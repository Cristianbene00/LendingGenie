import { debugChannelFetch } from '../src/sync/teams.js';
async function main() { await debugChannelFetch(); process.exit(0); }
main().catch((e) => { console.error(e); process.exit(1); });
