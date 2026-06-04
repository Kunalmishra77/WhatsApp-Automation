const { Client } = require("pg");
const DB_URL = "postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";
async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query("SELECT email, id FROM auth.users LIMIT 10");
  rows.forEach(r => console.log(r.email, "|", r.id));
  await client.end();
}
run().catch(console.error);
