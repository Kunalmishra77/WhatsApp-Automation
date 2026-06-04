// Apply migrations 014 and 017 if their tables are missing
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_URL = 'postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

async function main() {
  const pg = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  // Check what tables actually exist (diagnostic)
  const { rows } = await pg.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
  );
  console.log('All public tables in DB:');
  rows.forEach(r => console.log(' -', r.table_name));

  // Check specific tables from missing migrations
  const checks = [
    { table: 'workspace_labels',   migration: '017_conversation_labels.sql' },
    { table: 'workspace_api_keys', migration: '014_api_keys.sql' },
    { table: 'contact_labels',     migration: null }, // might be a join table
  ];

  for (const check of checks) {
    const { rows: r } = await pg.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [check.table]
    );
    if (r.length) {
      console.log(`\n✅ ${check.table} exists`);
    } else if (check.migration) {
      console.log(`\n❌ ${check.table} missing — running ${check.migration}...`);
      const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', check.migration), 'utf-8');
      try {
        await pg.query(sql);
        console.log(`✅ ${check.migration} applied`);
      } catch (err) {
        console.error(`❌ Failed: ${err.message}`);
      }
    } else {
      console.log(`\n⚠️  ${check.table} missing (no migration file found)`);
    }
  }

  await pg.end();
}

main().catch(console.error);
