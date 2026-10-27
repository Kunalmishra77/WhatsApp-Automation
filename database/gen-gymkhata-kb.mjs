// One-off: generates database/migrations/121_v4you_gymkhata_kb.sql
//
// The knowledge base is searched by embedding, so a row inserted without one is
// never retrieved. Plain SQL cannot produce a vector, so the embeddings are made
// here with the same model the app uses (text-embedding-3-small) and written into
// the migration as literals. Run with the OpenAI key in .env.local; delete after.
import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE = '7e682114-996a-4255-9d0d-3afd1f677d3c'; // V4you Tech

const env = fs.readFileSync('.env.local', 'utf8');
const KEY = env.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) { console.error('No OPENAI_API_KEY in .env.local'); process.exit(1); }

// Each entry is one knowledge-base row. `title` is what the operator sees in the
// Knowledge Base page; `content` is what reaches the model.
const DOCS = [
  {
    title: 'GymKhata — what it is',
    content: `GymKhata is software for running a gym, made by V4you Tech.

It does four things. It sends your members WhatsApp reminders before their fees are due, so renewals stop getting missed. It gives you one screen showing who came today, whose fees are pending and how much came in this month. It marks attendance automatically using the member's face, on an ordinary mobile — no turnstile and no new machine. And it lets new members fill their own details from a QR code, so your staff only have to approve.

It is in Hindi, with English available, and it is built for a mobile.

It is already running at a gym in Indirapuram, Ghaziabad.`,
  },
  {
    title: 'GymKhata — price',
    content: `GymKhata has two prices. These are the only two. Never quote a per-member rate, a discount, or any other package.

Monthly: Rs 1,999 a month plus GST. Everything is included and V4you runs it for you. The price is the same whether the gym has fifty members or five hundred.

One-time: Rs 30,000 once. V4you builds the whole thing for that gym, set up for their plans, their prices and their branding, and it is theirs. No monthly fee after that. On this plan, hosting the system and any changes they want later are the gym's own to arrange.

Most gyms start monthly, because there is nothing large to pay up front and they see it working with their own members first.

There is nothing to pay to see the demo.

Two things are not included in either plan. First, WhatsApp's own charge: Meta charges for the messages, not V4you. A renewal reminder costs about 6 paise, so a gym with 300 members sending five reminders a month spends under Rs 100 on it, and when a member replies it costs nothing at all. Second, the reception phone for face attendance: any ordinary Android phone works and the gym buys it themselves.

IMPORTANT: GymKhata's price is Rs 1,999 a month. It is NOT the Rs 25,000 Starter plan or any other V4you automation plan — those are a different service. When a gym owner asks what membership or the software costs, the answer is Rs 1,999 a month plus GST.`,
  },
  {
    title: 'GymKhata — reminders and renewals',
    content: `GymKhata messages a member on WhatsApp before their fees are due — 7 days before, 3 days, 2 days, 1 day, and on the day itself. If they still have not paid, it follows up for up to a week afterwards. The gym sets how many days.

Messages only go between 8 am and 9 pm, and there is a limit per number per day, so a family sharing one phone is not flooded.

If a member pays, the reminders stop immediately. If a member asks to stop, they stop and stay stopped.

Whoever does not respond appears on the gym's call list the next morning, with the reason they are on it and what was said the last time they were called.

These are official WhatsApp Business messages on approved templates, not a personal number sending bulk messages.`,
  },
  {
    title: 'GymKhata — what the owner can see',
    content: `One screen shows: how many members the gym has, who came in today, whose fees are due this week, whose have already lapsed, how much money came in this month compared to last month, and whatever is waiting for approval.

Members: search by name, number or code. Each member has their plan, their payments, their attendance and their ID on file.

Attendance: a month calendar, or any week, month, year or dates chosen. With a chart, and a download.

Reports: money, new members, renewals, personal training, trials, how many renewed, who left, which hours are busiest, which plans sell, and what difference the reminders made. Over any period, and downloadable.

Enquiries: every enquiry, where it came from, and how many became members.

There is also a record of who changed what and when.`,
  },
  {
    title: 'GymKhata — face attendance',
    content: `A mobile or tablet kept at the gym's reception counter recognises the member's face and marks their attendance. Nothing to press, nothing to carry.

No turnstile, no fingerprint machine and no new hardware is needed. An ordinary Android phone is enough, and the gym buys it themselves — V4you will tell them what to look for.

If a face does not read — a cap, poor light — the member types their number on a keypad instead.

A member who does not want face attendance can refuse, and the gym's staff mark them by hand. Face data is stored encrypted and is deleted when a member leaves.`,
  },
  {
    title: 'GymKhata — new members and payments',
    content: `The gym puts a QR code at reception. A new member scans it and fills in their own details on their own phone — name, number, photo and ID. Staff only have to approve it.

The ID photograph is checked automatically: that it is the card they said it was, and that the name and date of birth match what they typed. The ID number itself is never stored.

The same face cannot join twice under a different name.

Members can pay by UPI, card or netbanking, or in cash at the desk. Cash is recorded too. Receipts are numbered and sent on WhatsApp.

If the gym wants, fees can be collected automatically every month through a UPI mandate.

The gym also gets a website of its own, where people can find it and sign up.`,
  },
  {
    title: 'GymKhata — getting started',
    content: `V4you sets the gym up for them, usually within a week. This one-week figure is confirmed and may be stated to a gym owner.

What V4you needs from the gym: the gym's details and timings, its plans and prices, and a mobile number for the WhatsApp messages.

If the gym already has a register or an Excel sheet of members, V4you imports it — they do not start from an empty list.

WhatsApp messages need Meta's approval first, which usually takes a day or two. V4you handles that, and it happens inside the same week.

The best place to begin is a demo: V4you shows the whole thing on a call, using a gym's worth of real-looking data, and the owner decides after that.`,
  },
  {
    title: 'GymKhata — what it does not do',
    content: `There is no separate mobile app for members. Members get WhatsApp messages and a web page.

There is no class or slot booking.

It does not connect to a turnstile or a gate.

It runs one gym at a time. If an owner has more than one branch, each is set up separately — say so and a person from V4you will explain how that works for them.

It does not produce GST invoices.

If a gym owner needs any of these, say so honestly and tell them a person will confirm whether it is coming. Never promise that a missing feature will be built.`,
  },
  {
    title: 'GymKhata — data and privacy',
    content: `The gym's members' data belongs to the gym. It is kept on servers in India, and each gym's data is separated at the database level.

An ID card number is never stored — only the photograph, and only while it is needed.

Face data is encrypted, is never shared, and is deleted when a member leaves the gym.

Members are told what is collected and can refuse face attendance.

The gym can export its members at any time.`,
  },
  {
    title: 'GymKhata — who built it',
    content: `GymKhata is made by V4you Tech (Santure AI Pvt Ltd).

It was built for a gym in Indirapuram, Ghaziabad that has been running since 2000, and it is in use there every day.

Do not name that gym or any other customer to a prospect without permission. One honest reference offered on a call is worth more than a vague claim of several gyms.

V4you is not a large company, and a gym owner deals with the people who built it.`,
  },
];

const PERSONA_ADDITION = `

## GymKhata (gym software) — overrides the sections above when the customer runs a gym
- *GymKhata* is V4you's own software for running a gym: WhatsApp fee reminders, one screen for members and money, face attendance on an ordinary Android phone, and QR self-signup. Recommend it directly when someone says they own or run a gym.
- *Price is Rs 1,999/month + GST, or Rs 30,000 one-time* for a build the gym keeps. These two replace the Rs 25,000 / Rs 49,000 / Rs 89,000 automation plans completely — never quote those to a gym owner, and never give a per-member rate or a discount.
- WhatsApp's own charge is separate and small: about 6 paise per reminder, and a member's reply costs nothing. Say this plainly if asked; it is not a hidden cost.
- Not included: the reception Android phone (the gym buys it), and on the one-time plan, hosting and later changes.
- *Setup: within a week.* This is the one timeline you may state, because the KB confirms it. Everything else still follows the no-timeline rule above.
- Does not do: a member mobile app, class booking, turnstiles, GST invoices, or several branches on one system. Say so honestly rather than promising it is coming.
- Still offer the demo and collect Name + Mobile + Gym name, exactly as for any other enquiry.`;

const sql = [];
sql.push(`-- 121 — GymKhata knowledge base and persona for V4you Tech.
--
-- V4you sells its own gym software. The assistant had nothing about it: a gym
-- owner asking the price would have been given the Rs 25,000 Starter plan from the
-- automation range, which is twelve times GymKhata's actual price and would end
-- the conversation.
--
-- Generated by scripts/gen-gymkhata-kb.mjs. The embeddings are real
-- text-embedding-3-small vectors, because retrieval is semantic — a row with a
-- null embedding is never found, so plain SQL could not have written these.
--
-- The existing V4you documents (web development, app development, AI automation)
-- are left untouched. They are a different line of business and a gym question
-- will not match them.

DELETE FROM public.knowledge_base
 WHERE workspace_id = '${WORKSPACE}' AND source = 'gymkhata';
`);

const texts = DOCS.map((d) => `${d.title}\n\n${d.content}`);
const res = await fetch('https://api.openai.com/v1/embeddings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
});
if (!res.ok) { console.error('Embedding failed:', res.status, await res.text()); process.exit(1); }
const { data } = await res.json();
console.log(`embedded ${data.length} documents, ${data[0].embedding.length} dimensions`);

const esc = (s) => s.replace(/'/g, "''");
DOCS.forEach((d, i) => {
  const vec = `[${data[i].embedding.join(',')}]`;
  sql.push(`INSERT INTO public.knowledge_base
  (workspace_id, title, content, category, source, is_active, is_draft, priority, char_count, embedding)
VALUES ('${WORKSPACE}', '${esc(d.title)}', '${esc(d.content)}', 'product', 'gymkhata', true, false, ${100 - i}, ${d.content.length}, '${vec}');
`);
});

sql.push(`-- Persona: append the GymKhata section if it is not already there. Appending
-- rather than replacing keeps Neha's existing instructions — tone, demo slots,
-- escalation, the automation plans — exactly as they are.
UPDATE public.workspaces
SET settings = jsonb_set(
      settings,
      '{agent_persona}',
      to_jsonb((settings->>'agent_persona') || ${`'${esc(PERSONA_ADDITION)}'`})
    )
WHERE id = '${WORKSPACE}'
  AND settings->>'agent_persona' NOT LIKE '%## GymKhata%';
`);

const out = path.join('database', 'migrations', '121_v4you_gymkhata_kb.sql');
fs.writeFileSync(out, sql.join('\n'));
console.log('wrote', out, `(${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
