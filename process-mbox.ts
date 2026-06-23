import fs from 'fs'; import path from 'path'; import { randomUUID } from 'crypto';
import { query } from '../src/shared/db.js'; import { logger } from '../src/shared/logger.js'; import { enqueueMboxProcessing } from '../src/shared/queue.js';
async function main(){const f=process.argv[2];if(!f){console.error('Usage: tsx scripts/process-mbox.ts <path>');process.exit(1);}
  const abs=path.resolve(f);if(!fs.existsSync(abs)){console.error(`Not found: ${abs}`);process.exit(1);}
  const stat=fs.statSync(abs);const id=randomUUID();
  await query(`INSERT INTO source_uploads (id,kind,filename,bytes,status) VALUES ($1,'mbox',$2,$3,'pending')`,[id,path.basename(abs),stat.size]);
  await enqueueMboxProcessing(id,abs);logger.info({id,bytes:stat.size},'enqueued');process.exit(0);}
main().catch(e=>{console.error(e);process.exit(1);});
