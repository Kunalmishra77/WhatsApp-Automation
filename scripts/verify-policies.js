const { Client } = require('pg');
const DB_URL = 'postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';
async function verify() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  // Check all workspace policies
  const { rows } = await client.query(`
    SELECT policyname, cmd, qual, with_check 
    FROM pg_policies 
    WHERE tablename = 'workspaces'
    ORDER BY policyname
  `);
  console.log('Workspace policies:');
  rows.forEach(r => console.log(` - ${r.policyname} (${r.cmd})`));
  
  // Check function exists
  const { rows: fns } = await client.query(`
    SELECT proname FROM pg_proc 
    WHERE proname = 'get_my_workspace_ids'
  `);
  console.log('\nget_my_workspace_ids function:', fns.length > 0 ? '✅ EXISTS' : '❌ MISSING');
  
  await client.end();
}
verify().catch(console.error);
