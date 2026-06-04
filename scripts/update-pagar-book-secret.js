// Store Pagar Book's app_secret in their workspace settings (DB)
const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  'https://yvqaproltcskufufmomi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cWFwcm9sdGNza3VmdWZtb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDA2NDc3MiwiZXhwIjoyMDk1NjQwNzcyfQ.hv81ELR5VR8qlkqASiXUz5WEm7Um8BZ8HNeL6WGcslA',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const { error } = await db
    .from('workspaces')
    .update({
      settings: { app_secret: 'c4176c068ebbae66ee34cd85f2888786' }
    })
    .eq('id', '28b40b22-110d-4423-9458-d859f30fc66a');

  if (error) { console.error('Error:', error.message); process.exit(1); }
  console.log('✅ Pagar Book app_secret stored in DB (workspace.settings.app_secret)');
  console.log('   No need to store this in Vercel env vars');
}
main().catch(console.error);
