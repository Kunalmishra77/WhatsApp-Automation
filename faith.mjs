import pg from 'pg';
import { readFileSync } from 'fs';
const key = readFileSync('.env.local','utf8').match(/^OPENAI_API_KEY=(.+)$/m)[1].trim();
const c=new pg.Client({connectionString:'postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres',ssl:{rejectUnauthorized:false}});
await c.connect();
const RZ='1bad6e27-f1fc-45ce-a876-98fb1db64373';
const MIN = Number(process.argv[2] ?? 0.35);
const persona=(await c.query(`select settings->>'agent_persona' as p from workspaces where id=$1`,[RZ])).rows[0].p;

const embed=async(t)=>{const r=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
  body:JSON.stringify({model:'text-embedding-3-small',input:t})});
  return (await r.json()).data[0].embedding;};

const Q = process.argv[3] ?? 'Geluslim gel 100 gram ka price kya hai?';
const emb = await embed(Q);
const vec = '['+emb.join(',')+']';
const docs = await c.query(`select * from match_vector_documents($1::vector, $2::uuid, 10, $3::float)`, [vec, RZ, MIN]);
console.log(`\n## Retrieval for: "${Q}"  (${docs.rows.length} chunks)\n`);
docs.rows.forEach((r,i)=>{
  const s = r.content.replace(/\s+/g,' ');
  const flag = /Not Mentioned on Website|Check website/i.test(s) ? '  <<< STALE PRICE CLAIM' : '';
  console.log(`  ${i+1}. [${r.filename?.slice(0,32)}] sim=${(r.similarity??0).toFixed(3)}${flag}`);
  console.log(`     ${s.slice(0,150)}`);
});
const kb = docs.rows.map(r=>`[${r.filename}] ${r.content}`).join('\n\n');
const kbBlock = `KNOWLEDGE BASE — THIS IS YOUR PRIMARY SOURCE OF TRUTH:
Read everything below before answering. Your reply MUST be grounded in this content.
Do NOT answer from memory, training data, or persona text when KB covers the topic.

${kb}

---END OF KNOWLEDGE BASE---

`;
const sys = kbBlock + persona;
const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
  body:JSON.stringify({model:'gpt-4o-mini',temperature:0,max_tokens:180,
    messages:[{role:'system',content:sys},{role:'user',content:Q}]})});
const b=await r.json();
console.log(`\n## BOT ka jawab (prompt ${b.usage?.prompt_tokens} tokens):\n`);
console.log('  '+(b.choices?.[0]?.message?.content??'ERR').replace(/\s+/g,' '));
await c.end();
