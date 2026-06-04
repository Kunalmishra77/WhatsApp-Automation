const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  'https://yvqaproltcskufufmomi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cWFwcm9sdGNza3VmdWZtb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDA2NDc3MiwiZXhwIjoyMDk1NjQwNzcyfQ.hv81ELR5VR8qlkqASiXUz5WEm7Um8BZ8HNeL6WGcslA',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  // Workspaces
  const { data: ws } = await db.from('workspaces').select('id,name,slug,plan,is_active,subscription_status,phone_number_id,waba_id,onboarding_complete');
  console.log('=== Workspaces ===');
  (ws ?? []).forEach(w => {
    console.log(`  [${w.id}] ${w.name} (${w.slug}) — plan:${w.plan} active:${w.is_active} wa:${w.phone_number_id ? '✓' : '✗'}`);
  });

  // Auth users
  const { data: users } = await db.auth.admin.listUsers();
  console.log('\n=== Auth Users ===');
  (users?.users ?? []).forEach(u => {
    console.log(`  [${u.id}] ${u.email} — confirmed:${!!u.confirmed_at}`);
  });

  // Profiles
  const { data: profiles } = await db.from('profiles').select('id,email,is_platform_admin');
  console.log('\n=== Profiles ===');
  (profiles ?? []).forEach(p => {
    console.log(`  [${p.id}] ${p.email} — platform_admin:${p.is_platform_admin}`);
  });
}

main().catch(console.error);
