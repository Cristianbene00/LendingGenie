import 'dotenv/config';
import fs from 'fs';
import pkg from 'pg';
const { Pool } = pkg;

const sql = fs.readFileSync(process.argv[2]!, 'utf8');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(sql);
  console.log('Migration applied.');
} finally {
  await pool.end();
}
