const { Client } = require("pg");
const DB_URL = "postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";
const NEW_TOKEN = "EAAVDwlgPdmoBRl4XYsZBoXjnBhCivWbWD5ohsMP02YCgz2HFix3KqkxEbjIkZCuKhXvz87mLCh7e2yuASl7d9bdSiAprb3WEMOKmbH8NBIuvQsJKueIRTjB3LxlUXG67lm35hNw607tE94eT3hHfpUnBDilwohslMGmo31Owr7s1qkgN2mXrooA0TrlWUohWzkkRo7ujYZA5vRa93Dnq4ZCu0y9lfm6956WagbxEWbZB5CXIa5GkUvUd8CyrJsZAAW2qjhl1vOpYVjDrD8HDdj";
async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(
    "UPDATE public.workspaces SET access_token = $1 WHERE slug = 'agentix-demo' RETURNING name, phone_number_id",
    [NEW_TOKEN]
  );
  if (rows.length > 0) { console.log("✅ Token updated in DB:", rows[0].name, "| Phone ID:", rows[0].phone_number_id); }
  else console.log("❌ Workspace not found");
  await client.end();
}
run().catch(console.error);
