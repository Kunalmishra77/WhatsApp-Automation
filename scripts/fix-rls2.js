const { Client } = require('pg');

const DB_URL = 'postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

async function fixRLS() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const steps = [
    // 1. Create security-definer helper function (single query, no semicolons to split on)
    `CREATE OR REPLACE FUNCTION public.get_my_workspace_ids()
     RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
     AS 'SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()'`,

    // 2. Drop the recursive SELECT policy
    `DROP POLICY IF EXISTS "members_workspace_isolation" ON public.workspace_members`,

    // 3. Recreate SELECT policy using security-definer function (no recursion)
    `CREATE POLICY "members_workspace_isolation" ON public.workspace_members
     FOR SELECT USING (workspace_id IN (SELECT public.get_my_workspace_ids()))`,

    // 4. Ensure INSERT policy exists
    `DROP POLICY IF EXISTS "members_insert_own" ON public.workspace_members`,
    `CREATE POLICY "members_insert_own" ON public.workspace_members
     FOR INSERT WITH CHECK (user_id = auth.uid())`,

    // 5. UPDATE policy
    `DROP POLICY IF EXISTS "members_update_admin" ON public.workspace_members`,
    `CREATE POLICY "members_update_admin" ON public.workspace_members
     FOR UPDATE USING (workspace_id IN (SELECT public.get_my_workspace_ids()))`,
  ];

  for (const stmt of steps) {
    try {
      await client.query(stmt);
      console.log('✅', stmt.trim().slice(0, 70).replace(/\s+/g, ' '));
    } catch (e) {
      console.error('❌', e.message);
    }
  }

  // Verify: try a simple query that would have caused recursion
  try {
    const { rows } = await client.query(`SELECT count(*) FROM public.workspace_members`);
    console.log('\n✅ workspace_members queryable without recursion. Count:', rows[0].count);
  } catch (e) {
    console.error('\n❌ Still broken:', e.message);
  }

  await client.end();
}

fixRLS().catch(console.error);
