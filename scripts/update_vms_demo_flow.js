const fs = require('fs');
const path = require('path');

function loadEnv() {
  const txt = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
  const env = {};
  txt.split('\n').forEach((line) => {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '').trim();
  });
  return env;
}

const WORKSPACE_ID = '8a196458-5c09-4403-83e4-23505d0084d7'; // VMS
const FLOW_ID = '8f4f5254-e373-4c3c-b290-9d5903abeb1f'; // Demo Booking Flow

const nodes = [
  {
    id: 'n1',
    type: 'start',
    data: { label: 'Start', triggerType: 'keyword', triggerValue: 'demo' },
    width: 208,
    height: 81,
    position: { x: 250, y: 50 },
  },
  {
    id: 'n2',
    type: 'message',
    data: {
      label: 'Welcome',
      message: '🎉 Bilkul! PagarBook ka demo *completely FREE* hai.\n\nHamari team aapke office visit karke sirf *20–30 minutes* mein software ka live demo degi.\n\nKoi hidden charges nahi, koi commitment nahi. 😊',
    },
    width: 208,
    height: 79,
    position: { x: 250, y: 200 },
  },
  {
    id: 'n3',
    type: 'question',
    data: {
      label: 'Ask Employee Count',
      message: '👥 Sabse pehle batayein, *aapki company mein kitne employees kaam karte hain?*\n\n(Please enter the approximate number.)',
      timeoutHours: 48,
      saveAsVariable: 'employee_count',
    },
    width: 208,
    height: 103,
    position: { x: 250, y: 350 },
  },
  {
    id: 'n4',
    type: 'condition',
    data: {
      label: 'Employee Count Check',
      conditionType: 'variable_compare',
      keyword: '',
      matchType: 'contains',
      variable: 'employee_count',
      operator: '>=',
      value: 10,
    },
    width: 208,
    height: 110,
    position: { x: 250, y: 520 },
  },
  {
    id: 'n5',
    type: 'message',
    data: {
      label: 'Not Eligible Yet',
      message: '🙏 Thank you for your interest in PagarBook.\n\nFilhaal hamara free on-site demo un businesses ke liye available hai jinke paas *minimum 10 employees* hain.\n\nJaise hi aapki team 10 ya usse zyada employees ki ho jaati hai, hume dobara contact karein. Hamari team aapke liye demo schedule kar degi.\n\nDhanyavaad! 😊',
    },
    width: 208,
    height: 79,
    position: { x: 550, y: 690 },
  },
  {
    id: 'n6',
    type: 'question',
    data: {
      label: 'Ask Date',
      message: '📅 Demo ke liye aapko kaunsa din convenient rahega?\n\nExample: Kal, Monday, Weekend ya koi specific date.',
      timeoutHours: 48,
    },
    width: 208,
    height: 103,
    position: { x: 250, y: 690 },
  },
  {
    id: 'n7',
    type: 'question',
    data: {
      label: 'Ask Time',
      message: '⏰ Kis time demo rakhna convenient rahega?\n\nExample:\n• Morning (10 AM – 1 PM)\n• Afternoon (2 PM – 6 PM)',
      timeoutHours: 48,
    },
    width: 208,
    height: 103,
    position: { x: 250, y: 860 },
  },
  {
    id: 'n8',
    type: 'question',
    data: {
      label: 'Ask Location',
      message: '📍 Demo ke liye apne office ka address ya location share karein.',
      timeoutHours: 48,
    },
    width: 208,
    height: 103,
    position: { x: 250, y: 1030 },
  },
  {
    id: 'n9',
    type: 'message',
    data: {
      label: 'Confirmation',
      message: '✅ Perfect! Humne aapki details note kar li hain.\n\nHamari team aapse jaldi contact karegi aur demo schedule confirm karegi.\n\n📞 9999103866\n📞 8285828645\n\nAgar aapke koi aur questions hain, toh zaroor poochiye. 😊',
    },
    width: 208,
    height: 79,
    position: { x: 250, y: 1200 },
  },
  {
    id: 'n10',
    type: 'assign_agent',
    data: {
      label: 'Assign to Sales Team',
      message: 'Demo request received! Aapki team se jald sampark kiya jayega.',
    },
    width: 208,
    height: 79,
    position: { x: 250, y: 1350 },
  },
];

const edges = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n2', target: 'n3' },
  { id: 'e3', source: 'n3', target: 'n4' },
  { id: 'e4', source: 'n4', target: 'n6', sourceHandle: 'yes' },
  { id: 'e5', source: 'n4', target: 'n5', sourceHandle: 'no' },
  { id: 'e6', source: 'n6', target: 'n7' },
  { id: 'e7', source: 'n7', target: 'n8' },
  { id: 'e8', source: 'n8', target: 'n9' },
  { id: 'e9', source: 'n9', target: 'n10' },
];

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const res = await fetch(
    `${url}/rest/v1/chatbot_flows?id=eq.${FLOW_ID}&workspace_id=eq.${WORKSPACE_ID}`,
    {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ nodes, edges, updated_at: new Date().toISOString() }),
    },
  );

  const data = await res.json();
  if (!res.ok) {
    console.error('Update failed:', JSON.stringify(data, null, 2));
    process.exit(1);
  }
  if (Array.isArray(data) && data.length === 0) {
    console.error('No row matched FLOW_ID/WORKSPACE_ID — nothing was updated.');
    process.exit(1);
  }
  console.log('Updated flow nodes:', data[0]?.nodes?.length, 'edges:', data[0]?.edges?.length);
}

main();
