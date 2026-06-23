import { randomUUID } from 'crypto';
import { query } from '../src/shared/db.js'; import { logger } from '../src/shared/logger.js'; import { enqueueTeamsSync } from '../src/shared/queue.js';
async function main(){let since:string|null=null;const i=process.argv.indexOf('--since');if(i>=0)since=process.argv[i+1]??null;
  const id=randomUUID();await query(`INSERT INTO source_uploads (id,kind,status) VALUES ($1,'teams_sync','pending')`,[id]);
  await enqueueTeamsSync(id,since);logger.info({id,since},'enqueued');process.exit(0);}
main().catch(e=>{console.error(e);process.exit(1);});
