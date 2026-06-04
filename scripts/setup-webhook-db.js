const { Client } = require("pg");
const DB_URL = "postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";
async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  // Add unique constraint so we can upsert conversations per contact
  try {
    await client.query(`ALTER TABLE public.conversations ADD CONSTRAINT conversations_workspace_contact_unique UNIQUE (workspace_id, contact_id)`);
    console.log("✅ Unique constraint added: workspace_id + contact_id");
  } catch(e) {
    if (e.message.includes("already exists")) {
      console.log("✅ Constraint already exists");
    } else {
      console.log("⚠️", e.message);
    }
  }

  // Allow service role / webhook to insert conversations & messages
  try {
    await client.query(`DROP POLICY IF EXISTS "conversations_insert_workspace" ON public.conversations`);
    await client.query(`CREATE POLICY "conversations_insert_workspace" ON public.conversations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR true)`);
    console.log("✅ Conversations insert policy set");
  } catch(e) { console.log("⚠️ conv policy:", e.message); }

  try {
    await client.query(`DROP POLICY IF EXISTS "messages_insert_workspace" ON public.messages`);
    await client.query(`CREATE POLICY "messages_insert_workspace" ON public.messages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR true)`);
    console.log("✅ Messages insert policy set");
  } catch(e) { console.log("⚠️ msg policy:", e.message); }

  await client.end();
}
run().catch(console.error);
