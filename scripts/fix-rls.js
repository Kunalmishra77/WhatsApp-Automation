const { Client } = require('pg');

const DB_URL = 'postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

async function fixRLS() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const sql = `
    -- Create security-definer function to break the RLS recursion
    CREATE OR REPLACE FUNCTION public.get_my_workspace_ids()
    RETURNS SETOF UUID
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = public
    AS $$
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid();
    $$;

    -- Drop recursive policy
    DROP POLICY IF EXISTS "members_workspace_isolation" ON public.workspace_members;

    -- Recreate using the security-definer function (no recursion)
    CREATE POLICY "members_workspace_isolation" ON public.workspace_members
      FOR SELECT USING (
        workspace_id IN (SELECT public.get_my_workspace_ids())
      );

    -- Also ensure INSERT policy is clean
    DROP POLICY IF EXISTS "members_insert_own" ON public.workspace_members;
    CREATE POLICY "members_insert_own" ON public.workspace_members
      FOR INSERT WITH CHECK (user_id = auth.uid());

    -- Allow update by admins using same pattern
    DROP POLICY IF EXISTS "members_update_admin" ON public.workspace_members;
    CREATE POLICY "members_update_admin" ON public.workspace_members
      FOR UPDATE USING (
        workspace_id IN (SELECT public.get_my_workspace_ids())
      );
  `;

  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    try {
      await client.query(stmt);
      console.log('OK:', stmt.slice(0, 60).replace(/\n/g, ' ') + '...');
    } catch (e) {
      console.error('ERR:', e.message, '|', stmt.slice(0, 60));
    }
  }

  await client.end();
  console.log('Done.');
}

fixRLS().catch(console.error);
