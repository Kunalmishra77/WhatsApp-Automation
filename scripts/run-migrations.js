#!/usr/bin/env node
/**
 * Migration runner for Agentix
 * Usage: node scripts/run-migrations.js
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local
 * Applies all pending migrations via the Supabase Management REST API.
 *
 * Prerequisites: node >= 18 (uses fetch natively)
 */

const fs   = require('fs');
const path = require('path');

// ── Load .env.local ───────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌  .env.local not found');
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const [key, ...rest] = line.trim().split('=');
    if (key && !key.startsWith('#')) {
      process.env[key] = rest.join('=').replace(/^["']|["']$/g, '');
    }
  }
}

loadEnv();

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// Extract project ref from URL: https://XXXXX.supabase.co → XXXXX
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
if (!projectRef) {
  console.error('❌  Could not extract project ref from Supabase URL');
  process.exit(1);
}

// ── Migration files ────────────────────────────────────────────────────────────
const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations');
const migrations = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log(`\n🚀  Agentix Migration Runner`);
console.log(`📂  Project: ${projectRef}`);
console.log(`📜  Found ${migrations.length} migration files\n`);

// ── Execute SQL via Supabase REST API (uses service role for admin operations) ─
// NOTE: Supabase's PostgREST /rest/v1/ endpoint only handles DML (SELECT/INSERT/UPDATE/DELETE)
// For DDL (CREATE TABLE / ALTER TABLE), we use the Supabase Management API.
// If you don't have a management API token, instructions are printed below.

async function runSql(sql) {
  // Try Supabase Management API (requires SUPABASE_ACCESS_TOKEN)
  const managementToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (managementToken) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managementToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Management API error: ${err}`);
    }
    return;
  }

  // Fallback: try direct pg connection via supabase CLI (requires supabase link)
  throw new Error('SUPABASE_ACCESS_TOKEN not set — see instructions below');
}

async function main() {
  const managementToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (!managementToken) {
    console.log('⚠️   SUPABASE_ACCESS_TOKEN not set in .env.local');
    console.log('');
    console.log('To get your token:');
    console.log('  1. Go to https://supabase.com/dashboard/account/tokens');
    console.log('  2. Create a new token named "Agentix Migration Runner"');
    console.log('  3. Add to .env.local:  SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx');
    console.log('  4. Re-run: node scripts/run-migrations.js');
    console.log('');
    console.log('─────────────────────────────────────────────────');
    console.log('OR apply manually in Supabase SQL Editor:');
    console.log('  https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
    console.log('');
    console.log('Copy and paste these files in order:');
    for (const f of migrations) {
      console.log(`  • database/migrations/${f}`);
    }
    console.log('─────────────────────────────────────────────────\n');
    process.exit(0);
  }

  let applied = 0;
  let failed  = 0;

  for (const file of migrations) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`  ⏳  ${file} ... `);
    try {
      await runSql(sql);
      console.log('✅');
      applied++;
    } catch (err) {
      console.log('❌');
      console.error(`     ${err.message}`);
      failed++;
      // Continue with other migrations (IF NOT EXISTS makes most idempotent)
    }
  }

  console.log(`\n✅  Applied: ${applied}  ❌  Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFailed migrations may already be applied (IF NOT EXISTS) — check Supabase dashboard.');
  }
}

main().catch(console.error);
