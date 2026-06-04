// Link platform admin to Pagar Book workspace as super_admin
const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  'https://yvqaproltcskufufmomi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cWFwcm9sdGNza3VmdWZtb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDA2NDc3MiwiZXhwIjoyMDk1NjQwNzcyfQ.hv81ELR5VR8qlkqASiXUz5WEm7Um8BZ8HNeL6WGcslA',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const ADMIN_USER_ID = '7ed8d55f-caef-4d11-b355-134899ac966a';
  const WORKSPACE_ID  = '28b40b22-110d-4423-9458-d859f30fc66a';

  // Check if already linked
  const { data: existing } = await db
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', WORKSPACE_ID)
    .eq('user_id', ADMIN_USER_ID)
    .single();

  if (existing) {
    console.log('Admin already linked to Pagar Book workspace');
    return;
  }

  const { error } = await db.from('workspace_members').insert({
    workspace_id: WORKSPACE_ID,
    user_id: ADMIN_USER_ID,
    role: 'super_admin',
  });

  if (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }

  console.log('✅ kunal.mishra.50999@gmail.com linked to Pagar Book workspace as super_admin');
  console.log('   You can now log in and see the Pagar Book workspace in the dashboard.');
}

main().catch(console.error);
