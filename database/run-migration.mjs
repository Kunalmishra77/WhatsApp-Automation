import pg from 'pg';
import { clientOptions } from './connection.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

const FILE = process.argv[2] ?? 'migrations/002_core_domain.sql';

const client = new Client(clientOptions());

const sql = readFileSync(join(__dirname, FILE), 'utf8');

try {
  await client.connect();
  console.log(`✓ Connected to Supabase`);
  await client.query(sql);
  console.log(`✓ Migration applied: ${FILE}`);
} catch (err) {
  console.error('✗ Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
