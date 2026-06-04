// Run all pending migrations on Supabase DB directly
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_URL = 'postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations');

// Check which tables/columns exist to determine what's applied
const CHECK_QUERIES = {
  '018_contact_notes':     `SELECT 1 FROM information_schema.tables WHERE table_name='contact_notes' LIMIT 1`,
  '019_time_triggers':     `SELECT 1 FROM information_schema.tables WHERE table_name='time_trigger_rules' LIMIT 1`,
  '020_phase2':            `SELECT 1 FROM information_schema.columns WHERE table_name='workspaces' AND column_name='custom_domain' LIMIT 1`,
  '021_phase3':            `SELECT 1 FROM information_schema.tables WHERE table_name='ab_tests' LIMIT 1`,
  '022_saas_platform':     `SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_platform_admin' LIMIT 1`,
  '023_vector_documents':  `SELECT 1 FROM information_schema.tables WHERE table_name='vector_documents' LIMIT 1`,
  '024_media_library':     `SELECT 1 FROM information_schema.tables WHERE table_name='media_library' LIMIT 1`,
};

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to Supabase DB\n');

  for (const [key, checkSql] of Object.entries(CHECK_QUERIES)) {
    const file = `${key}.sql`;
    const filePath = path.join(MIGRATIONS_DIR, file);

    if (!fs.existsSync(filePath)) {
      console.log(`[SKIP] ${file} — file not found`);
      continue;
    }

    const { rows } = await client.query(checkSql);
    if (rows.length > 0) {
      console.log(`[SKIP] ${file} — already applied`);
      continue;
    }

    // Run the migration
    console.log(`[RUN ] ${file} ...`);
    const sql = fs.readFileSync(filePath, 'utf-8');
    try {
      await client.query(sql);
      console.log(`[OK  ] ${file}`);
    } catch (err) {
      console.error(`[FAIL] ${file}: ${err.message}`);
    }
  }

  // Also ensure pgvector extension is enabled
  console.log('\nEnsuring pgvector extension...');
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('[OK  ] pgvector extension enabled');
  } catch (err) {
    console.warn('[WARN] pgvector:', err.message);
  }

  await client.end();
  console.log('\n✅ Migration check complete');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
