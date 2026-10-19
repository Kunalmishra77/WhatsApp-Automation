import pg from 'pg';
const c=new pg.Client({connectionString:'postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres',ssl:{rejectUnauthorized:false}});
await c.connect();
const q=async()=>(await c.query(`select count(*)::int as n from leads where ai_classified_at is null and conversation_id is not null`)).rows[0].n;
const start=await q();
console.log(`start queue: ${start}`);
for (let i=1;i<=14;i++){
  await new Promise(s=>setTimeout(s,60000));
  const n=await q();
  const cost=(await c.query(`select round(sum(cost_usd)::numeric,3) as usd, count(*)::int as calls
    from ai_usage where task='lead_classify' and created_at > now() - interval '25 minutes'`)).rows[0];
  console.log(`+${i}min  queue=${n}  (done ${start-n})  | classify calls last 25min: ${cost.calls} ($${cost.usd??0})`);
  if (n===0){ console.log('\nQUEUE KHALI — re-score poora ho gaya'); break; }
}
await c.end();
