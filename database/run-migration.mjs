import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false },
});

const sql = readFileSync(join(__dirname, 'migrations', '001_auth_workspace.sql'), 'utf8');

try {
  await client.connect();
  console.log('✓ Connected to Supabase');
  await client.query(sql);
  console.log('✓ Migration applied successfully');
} catch (err) {
  console.error('✗ Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
