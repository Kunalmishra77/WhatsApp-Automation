// Platform Reset Script — clears all workspaces + non-admin auth users
// Preserves: platform admin accounts (is_platform_admin = true)

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yvqaproltcskufufmomi.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cWFwcm9sdGNza3VmdWZtb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDA2NDc3MiwiZXhwIjoyMDk1NjQwNzcyfQ.hv81ELR5VR8qlkqASiXUz5WEm7Um8BZ8HNeL6WGcslA';

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('=== Agentix Platform Reset ===\n');

  // 1. Find all platform admin user IDs (these will be preserved)
  const { data: admins, error: adminErr } = await db
    .from('profiles')
    .select('id, email')
    .eq('is_platform_admin', true);

  if (adminErr) {
    console.error('Error fetching admins:', adminErr.message);
    process.exit(1);
  }

  const adminIds = new Set((admins ?? []).map(a => a.id));
  console.log(`Platform admins to preserve: ${[...adminIds].length}`);
  (admins ?? []).forEach(a => console.log(`  - ${a.email} (${a.id})`));

  // 2. Get all workspace members (to find users to delete)
  const { data: allMembers } = await db
    .from('workspace_members')
    .select('user_id');

  const memberUserIds = [...new Set((allMembers ?? []).map(m => m.user_id))];
  const nonAdminUsers = memberUserIds.filter(uid => !adminIds.has(uid));
  console.log(`\nClient auth users to delete: ${nonAdminUsers.length}`);

  // 3. Delete ALL workspaces (cascade removes all related data)
  console.log('\nDeleting all workspaces (cascade)...');
  const { error: wsErr, count } = await db
    .from('workspaces')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000'); // matches all rows

  if (wsErr) {
    console.error('Error deleting workspaces:', wsErr.message);
    process.exit(1);
  }
  console.log(`Deleted workspaces OK`);

  // 4. Delete non-admin auth users
  console.log(`\nDeleting ${nonAdminUsers.length} client auth users...`);
  let deletedUsers = 0;
  for (const uid of nonAdminUsers) {
    const { error } = await db.auth.admin.deleteUser(uid);
    if (!error) {
      deletedUsers++;
    } else {
      console.warn(`  Could not delete user ${uid}: ${error.message}`);
    }
  }
  console.log(`Deleted ${deletedUsers} auth users`);

  // 5. Clear orphan profiles (profiles with no auth user)
  await db.from('profiles').delete().not('id', 'in', `(${[...adminIds].join(',')})`).neq('id', '00000000-0000-0000-0000-000000000000');

  console.log('\n✅ Platform reset complete. DB is now fresh.');
  console.log('Admin accounts preserved:', (admins ?? []).map(a => a.email).join(', '));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
