const { Client } = require("pg");
const DB_URL = "postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";
async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  const { rows } = await client.query(`
    UPDATE public.workspaces 
    SET phone_number_id = '1109891212213897',
        waba_id = '1665259677955542',
        access_token = 'EAAVDwlgPdmoBRirf2zkRbvNdzEt9XQbFzrDp38ZCSbneW4Jk5ZAzChddhBc49IZBxPckcXcdc6t199BNKQFbkr8AukbnhoW2rgij7E7e4ZAbnGbJeHsnMLqKiMwhhtcP6aXS1CIk0R394rokxZAlA1okKZCu9An9MXzsfrBiZCp3McZAjLlEVL4UaSQa1sJDHxddUfEaFkAvOq9vN2jlvU3hkQRkZBKOjIwZBCf3vcQvcIIj2je8gbEwk5COrqhyl3QYPh1QkWBZBZCAEi3vpG9zSdme'
    WHERE slug = 'agentix-demo'
    RETURNING id, name, slug, phone_number_id, waba_id
  `);
  
  if (rows.length > 0) {
    console.log("✅ Workspace updated!");
    console.log("   Name:", rows[0].name);
    console.log("   Phone Number ID:", rows[0].phone_number_id);
    console.log("   WABA ID:", rows[0].waba_id);
  } else {
    console.log("❌ Workspace not found");
  }
  
  await client.end();
}
run().catch(console.error);
