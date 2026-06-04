const { Client } = require("pg");
const DB_URL = "postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";
async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Delete outbound messages that failed (status=queued, direction=outbound, whatsapp_msg_id is null)
  const { rowCount } = await client.query(`
    DELETE FROM public.messages
    WHERE direction = 'outbound'
      AND status = 'queued'
      AND whatsapp_msg_id IS NULL
      AND content IN ('hyy', 'hyyy')
    RETURNING content, created_at
  `);
  console.log("✅ Deleted failed messages:", rowCount);

  // Also show all outbound messages to verify
  const { rows } = await client.query(`
    SELECT content, status, direction, whatsapp_msg_id, created_at
    FROM public.messages
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log("\nRecent messages:");
  rows.forEach(r => console.log(` [${r.direction}] "${r.content}" - ${r.status} | wa_id: ${r.whatsapp_msg_id}`));

  await client.end();
}
run().catch(console.error);
