const { Client } = require("pg");
const DB_URL = "postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";
const TOKEN = "EAAVylcUMcmwBRioa5ZAXEZCSPg7OyFuIM0fNv1dATVBVKp3S8n2pmgxfbOrJTiGb4DUmPtzieN2Cx8e5fsrAD5PRZADDQBhwIVryXyebOczaSIhWqpeN5Fkyhy1K1aGlMZAbBoel5ejRukJWW6S4osAGxTRzHSLdtUkSf0NVFOYcL0wj35uAhl7I5blSWwZDZD";
async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query("UPDATE public.workspaces SET access_token = $1 WHERE slug = $2 RETURNING name", [TOKEN, "agentix-demo"]);
  console.log("✅ DB updated:", rows[0]?.name);
  await client.end();
}
run().catch(console.error);
