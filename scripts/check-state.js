const { Client } = require("pg");
const DB_URL = "postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";
async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  const { rows: members } = await client.query(`
    SELECT wm.user_id, wm.role, w.name, w.slug, w.id as workspace_id
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
  `);
  
  console.log("Workspace memberships:");
  if (members.length === 0) {
    console.log("  None");
  } else {
    members.forEach(r => console.log(`  User ${r.user_id} -> "${r.name}" (${r.slug}) as ${r.role}`));
  }
  
  const { rows: workspaces } = await client.query("SELECT id, name, slug FROM workspaces");
  console.log("\nAll workspaces:", workspaces.length > 0 ? workspaces : "None");
  
  await client.end();
}
run().catch(console.error);
