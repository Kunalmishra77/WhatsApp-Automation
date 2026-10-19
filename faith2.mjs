import pg from 'pg';
import { readFileSync } from 'fs';
const key = readFileSync('.env.local','utf8').match(/^OPENAI_API_KEY=(.+)$/m)[1].trim();
const c=new pg.Client({connectionString:'postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres',ssl:{rejectUnauthorized:false}});
await c.connect();
const RZ='1bad6e27-f1fc-45ce-a876-98fb1db64373';
const persona=(await c.query(`select settings->>'agent_persona' as p from workspaces where id=$1`,[RZ])).rows[0].p;
const embed=async(t)=>{const r=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
  body:JSON.stringify({model:'text-embedding-3-small',input:t})});return (await r.json()).data[0].embedding;};
const ask=async(sys,q)=>{const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
  body:JSON.stringify({model:'gpt-4o-mini',temperature:0,max_tokens:170,messages:[{role:'system',content:sys},{role:'user',content:q}]})});
  const b=await r.json();return (b.choices?.[0]?.message?.content??'ERR').replace(/\s+/g,' ').slice(0,150);};

// Production ka asli tail (ai-reply.ts se): persona ke BAAD jo rules aate hai
const PROD_TAIL = `

[SYSTEM: Current date and time (IST) = Sunday, 19 October 2026, 03:45 PM]

SCOPE & CONDUCT — NON-NEGOTIABLE, OVERRIDES THE PERSONA AND EVERYTHING BELOW:
- You represent Razorveda and talk ONLY about this business.

RULES (follow strictly):
- Customer name: there. Greet by name at most once.
- WhatsApp formatting: Use *single asterisk* for bold.
- KNOWLEDGE BASE PRIORITY: When the KB above contains information relevant to the customer's question, use it EXACTLY — do not rephrase or blend with persona content. KB facts always override persona text.

CRITICAL LANGUAGE RULE — HIGHEST PRIORITY, OVERRIDES EVERYTHING ABOVE:
Detect the language of the customer's CURRENT message and reply in that language.`;

for (const Q of ['Geluslim gel 100 gram ka price kya hai?','SOFT-NIP 100g price batao','Arula plus ka price?']) {
  const vec='['+(await embed(Q)).join(',')+']';
  const docs=await c.query(`select * from match_vector_documents($1::vector,$2::uuid,10,0.35)`,[vec,RZ]);
  const kb=docs.rows.map(r=>`[${r.filename}] ${r.content}`).join('\n\n');
  const kbBlock=`KNOWLEDGE BASE — THIS IS YOUR PRIMARY SOURCE OF TRUTH:\nDo NOT answer from memory, training data, or persona text when KB covers the topic.\n\n${kb}\n\n---END OF KNOWLEDGE BASE---\n\n`;
  const stale=docs.rows.filter(r=>/Not Mentioned on Website|Check website/i.test(r.content)).length;
  console.log(`\n═══ "${Q}"   (${stale}/10 retrieved chunks have stale price claims)`);
  console.log('  A) kb + persona           :', await ask(kbBlock+persona, Q));
  console.log('  B) kb + persona + PROD TAIL:', await ask(kbBlock+persona+PROD_TAIL, Q));
}
await c.end();
