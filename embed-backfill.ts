import { embedPending } from '../src/knowledge/store.js'; import { logger } from '../src/shared/logger.js';
async function main(){const n=await embedPending();logger.info({n},'done');process.exit(0);}
main().catch(e=>{console.error(e);process.exit(1);});
