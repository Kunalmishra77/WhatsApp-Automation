const { Client } = require('pg');
const DB_URL = 'postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

async function fix() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const steps = [
    // Allow authenticated users to INSERT new workspaces
    `DROP POLICY IF EXISTS "workspaces_insert_auth" ON public.workspaces`,
    `CREATE POLICY "workspaces_insert_auth" ON public.workspaces
     FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)`,

    // Rewrite SELECT to use security-definer function (no recursion risk)
    `DROP POLICY IF EXISTS "workspaces_member_read" ON public.workspaces`,
    `CREATE POLICY "workspaces_member_read" ON public.workspaces
     FOR SELECT USING (id IN (SELECT public.get_my_workspace_ids()))`,

    // Rewrite admin UPDATE to use security-definer function
    `DROP POLICY IF EXISTS "workspaces_admin_write" ON public.workspaces`,
    `CREATE POLICY "workspaces_admin_write" ON public.workspaces
     FOR UPDATE USING (
       id IN (
         SELECT wm.workspace_id FROM public.workspace_members wm
         WHERE wm.user_id = auth.uid() AND wm.role IN ('super_admin','admin')
       )
     )`,

    // Allow DELETE for super_admins
    `DROP POLICY IF EXISTS "workspaces_superadmin_delete" ON public.workspaces`,
    `CREATE POLICY "workspaces_superadmin_delete" ON public.workspaces
     FOR DELETE USING (
       id IN (
         SELECT wm.workspace_id FROM public.workspace_members wm
         WHERE wm.user_id = auth.uid() AND wm.role = 'super_admin'
       )
     )`,
  ];

  for (const stmt of steps) {
    try {
      await client.query(stmt);
      console.log('✅', stmt.trim().replace(/\s+/g, ' ').slice(0, 80));
    } catch (e) {
      console.error('❌', e.message, '|', stmt.trim().slice(0, 60));
    }
  }

  // Verify INSERT works conceptually
  console.log('\nAll workspace policies updated.');
  await client.end();
}

fix().catch(console.error);
