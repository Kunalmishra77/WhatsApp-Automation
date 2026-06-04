// A-Z Platform Health Check
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

const SUPABASE_URL = 'https://yvqaproltcskufufmomi.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cWFwcm9sdGNza3VmdWZtb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDA2NDc3MiwiZXhwIjoyMDk1NjQwNzcyfQ.hv81ELR5VR8qlkqASiXUz5WEm7Um8BZ8HNeL6WGcslA';
const DB_URL       = 'postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WORKSPACE_ID     = '28b40b22-110d-4423-9458-d859f30fc66a';
const PHONE_NUMBER_ID  = '1173335072523347';
const ACCESS_TOKEN     = 'EAAOWJegSYOABRT8n2r7Hhe1pWiBOvYQfk8UwkiWnlRVLnxgOyYlgSuSnzwZAl28abUdePhzUKeGCZBWI13WNPGFEgQMijh7nGmzGptZBhuUqSLGpFsQ3WodaTe25hT9e0TNZABu1pyHpnA5cANIJxZBBl6CC0ZAzGZAvzREtfUZAoOWkCVE5JwmJceDan2drkgZDZD';

const VERCEL_URL = 'https://whatsapp-automation-kohl-six.vercel.app';

let pass = 0, fail = 0, warn = 0;

function ok(msg)   { console.log(`  ✅ ${msg}`); pass++; }
function no(msg)   { console.log(`  ❌ ${msg}`); fail++; }
function w(msg)    { console.log(`  ⚠️  ${msg}`); warn++; }
function section(s){ console.log(`\n━━━ ${s} ━━━`); }

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   Agentix Platform A-Z Health Check  ║');
  console.log('╚══════════════════════════════════════╝');

  // ── 1. DB TABLES ─────────────────────────────────────────────────────────
  section('1. Database Tables');
  const pg = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const REQUIRED_TABLES = [
    'profiles','workspaces','workspace_members','contacts','conversations',
    'messages','chatbot_flows','flow_sessions','knowledge_base','vector_documents',
    'campaigns','campaign_recipients','templates','contacts_labels','conversation_labels',
    'follow_up_sequences','contact_sequences','orders','csat_responses','inbox_rules',
    'quick_replies','business_hours','api_keys','media_library','platform_usage_logs',
  ];

  const { rows: tableRows } = await pg.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`
  );
  const existingTables = new Set(tableRows.map(r => r.table_name));

  for (const t of REQUIRED_TABLES) {
    if (existingTables.has(t)) ok(t);
    else no(`Table missing: ${t}`);
  }

  // ── 2. DB FUNCTIONS ───────────────────────────────────────────────────────
  section('2. Database Functions / Extensions');
  const { rows: extRows } = await pg.query(`SELECT extname FROM pg_extension WHERE extname='vector'`);
  if (extRows.length) ok('pgvector extension enabled');
  else no('pgvector extension NOT enabled');

  const { rows: fnRows } = await pg.query(
    `SELECT proname FROM pg_proc WHERE proname IN ('match_vector_documents','match_knowledge_base','get_my_workspace_ids')`
  );
  const fnSet = new Set(fnRows.map(r => r.proname));
  ['match_vector_documents','match_knowledge_base','get_my_workspace_ids'].forEach(fn => {
    if (fnSet.has(fn)) ok(`function: ${fn}`);
    else no(`function missing: ${fn}`);
  });

  await pg.end();

  // ── 3. WORKSPACE STATE ────────────────────────────────────────────────────
  section('3. Workspace State');
  const { data: ws, error: wsErr } = await db.from('workspaces').select('*').eq('id', WORKSPACE_ID).single();
  if (wsErr || !ws) { no('Pagar Book workspace not found'); }
  else {
    ok(`Workspace: ${ws.name} (${ws.slug})`);
    if (ws.is_active) ok('is_active: true'); else no('is_active: false');
    if (ws.phone_number_id) ok(`phone_number_id: ${ws.phone_number_id}`); else no('phone_number_id not set');
    if (ws.waba_id) ok(`waba_id: ${ws.waba_id}`); else no('waba_id not set');
    if (ws.access_token) ok('access_token: stored'); else no('access_token not set');
    if (ws.webhook_secret) ok(`webhook_secret: ${ws.webhook_secret}`); else w('webhook_secret not set');
    if (ws.onboarding_complete) ok('onboarding_complete: true'); else w('onboarding_complete: false');
    if (ws.subscription_status === 'active') ok(`subscription_status: active`);
    else w(`subscription_status: ${ws.subscription_status}`);
  }

  // ── 4. AUTH USERS ─────────────────────────────────────────────────────────
  section('4. Auth Users & Workspace Members');
  const { data: users } = await db.auth.admin.listUsers();
  ok(`Total auth users: ${users?.users?.length ?? 0}`);
  const { data: members } = await db.from('workspace_members').select('user_id,role').eq('workspace_id', WORKSPACE_ID);
  if (members?.length) {
    ok(`Workspace members: ${members.length}`);
    members.forEach(m => ok(`  Member: ${m.user_id.slice(0,8)}... role:${m.role}`));
  } else {
    no('No workspace members — nobody can log in to Pagar Book workspace');
  }

  // ── 5. WHATSAPP API CONNECTIVITY ──────────────────────────────────────────
  section('5. WhatsApp API Connectivity');
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name,quality_rating,status`,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
    const data = await res.json();
    if (res.ok) {
      ok(`Phone connected: ${data.display_phone_number}`);
      ok(`Business name: ${data.verified_name}`);
      ok(`Quality rating: ${data.quality_rating}`);
      ok(`Status: ${data.status}`);
    } else {
      no(`WhatsApp API error: ${data.error?.message ?? 'Unknown'}`);
    }
  } catch (err) {
    no(`WhatsApp API fetch failed: ${err.message}`);
  }

  // ── 6. WEBHOOK VERIFICATION ───────────────────────────────────────────────
  section('6. Webhook (GET verify)');
  try {
    const verifyUrl = `${VERCEL_URL}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=agentix-webhook-secret-2026&hub.challenge=test123`;
    const res = await fetch(verifyUrl);
    const body = await res.text();
    if (res.ok && body === 'test123') ok('Webhook GET verify: PASSED');
    else if (res.status === 403) no(`Webhook verify failed — wrong verify_token or server down (${res.status})`);
    else no(`Webhook verify unexpected: status=${res.status} body=${body.slice(0,50)}`);
  } catch (err) {
    no(`Webhook verify fetch failed: ${err.message}`);
  }

  // ── 7. VERCEL API ENDPOINTS ───────────────────────────────────────────────
  section('7. Vercel Deployment (public endpoints)');
  const publicEndpoints = [
    ['GET', `${VERCEL_URL}/`, 'Landing page'],
    ['GET', `${VERCEL_URL}/login`, 'Login page'],
    ['GET', `${VERCEL_URL}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=agentix-webhook-secret-2026&hub.challenge=ping`, 'Webhook verify'],
  ];
  for (const [method, url, label] of publicEndpoints) {
    try {
      const r = await fetch(url, { method, redirect: 'follow' });
      if (r.ok || r.status === 200 || r.status === 302) ok(`${label}: ${r.status}`);
      else w(`${label}: ${r.status}`);
    } catch (e) {
      no(`${label}: fetch error — ${e.message}`);
    }
  }

  // ── 8. ENV VARS (local .env.local) ────────────────────────────────────────
  section('8. Environment Variables (local .env.local)');
  const envPath = require('path').join(__dirname, '..', '.env.local');
  const envContent = require('fs').readFileSync(envPath, 'utf-8');
  const envVars = {};
  envContent.split('\n').forEach(line => {
    const [k,...v] = line.split('=');
    if (k?.trim()) envVars[k.trim()] = v.join('=').trim();
  });

  const REQUIRED_ENV = [
    'NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY',
    'WHATSAPP_WEBHOOK_SECRET','META_APP_SECRET','OPENROUTER_API_KEY',
  ];
  const OPTIONAL_ENV = ['OPENAI_API_KEY','RESEND_API_KEY','RAZORPAY_KEY_ID'];

  for (const key of REQUIRED_ENV) {
    const val = envVars[key];
    if (!val || val === '' || val.includes('placeholder')) no(`${key}: NOT SET or placeholder`);
    else ok(`${key}: set`);
  }
  for (const key of OPTIONAL_ENV) {
    const val = envVars[key];
    if (!val || val === '' || val.includes('placeholder')) w(`${key}: not set (optional)`);
    else ok(`${key}: set`);
  }

  // Check if META_APP_SECRET matches Pagar Book app secret
  const currentAppSecret = envVars['META_APP_SECRET'];
  if (currentAppSecret === 'c4176c068ebbae66ee34cd85f2888786') {
    ok('META_APP_SECRET matches Pagar Book app secret ✓');
  } else {
    no('META_APP_SECRET is OLD value — must update on Vercel to: c4176c068ebbae66ee34cd85f2888786');
  }

  // ── 9. VECTOR KB (search test) ────────────────────────────────────────────
  section('9. Vector Knowledge Base');
  const { data: vDocs } = await db.from('vector_documents').select('id,filename').eq('workspace_id', WORKSPACE_ID);
  if (!vDocs?.length) w('No vector documents uploaded for Pagar Book workspace');
  else ok(`Vector documents: ${vDocs.length} chunks for ${[...new Set(vDocs.map(d => d.filename))].length} files`);

  // ── 10. SUMMARY ───────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════╗');
  console.log(`║  PASS: ${String(pass).padEnd(4)} WARN: ${String(warn).padEnd(4)} FAIL: ${String(fail).padEnd(4)}        ║`);
  console.log('╚══════════════════════════════════════╝');

  if (fail === 0) console.log('\n🚀 Platform is HEALTHY — ready for production!');
  else console.log(`\n⚠️  ${fail} issues need fixing before production use.`);
}

main().catch(err => {
  console.error('Check script failed:', err.message);
  process.exit(1);
});
