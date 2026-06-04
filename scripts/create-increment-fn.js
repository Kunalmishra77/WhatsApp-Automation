const { Client } = require("pg");
const DB_URL = "postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres";
async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    CREATE OR REPLACE FUNCTION public.increment_unread(conv_id UUID)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      UPDATE public.conversations
      SET 
        unread_count = unread_count + 1,
        last_message_at = NOW(),
        status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END
      WHERE id = conv_id;
    END;
    $$;
  `);
  console.log("✅ increment_unread function created");

  await client.end();
}
run().catch(console.error);
