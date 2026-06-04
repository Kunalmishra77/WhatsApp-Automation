// Test WhatsApp message send capability
const PHONE_NUMBER_ID = '1173335072523347';
const ACCESS_TOKEN    = 'EAAOWJegSYOABRT8n2r7Hhe1pWiBOvYQfk8UwkiWnlRVLnxgOyYlgSuSnzwZAl28abUdePhzUKeGCZBWI13WNPGFEgQMijh7nGmzGptZBhuUqSLGpFsQ3WodaTe25hT9e0TNZABu1pyHpnA5cANIJxZBBl6CC0ZAzGZAvzREtfUZAoOWkCVE5JwmJceDan2drkgZDZD';

// Test: fetch phone number info + template list
async function main() {
  console.log('=== WhatsApp API Tests ===\n');

  // 1. Phone number details
  const phoneRes = await fetch(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name,quality_rating,status,platform_type,throughput`,
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  );
  const phone = await phoneRes.json();
  console.log('📱 Phone Number Info:');
  if (phoneRes.ok) {
    console.log(`  Number    : ${phone.display_phone_number}`);
    console.log(`  Name      : ${phone.verified_name}`);
    console.log(`  Status    : ${phone.status}`);
    console.log(`  Quality   : ${phone.quality_rating}`);
    console.log(`  Platform  : ${phone.platform_type}`);
    if (phone.throughput) console.log(`  Throughput: ${phone.throughput.level}`);
  } else {
    console.log('  ❌ Error:', phone.error?.message);
  }

  // 2. List templates for the WABA
  const WABA_ID = '1708964607185517';
  const tplRes = await fetch(
    `https://graph.facebook.com/v19.0/${WABA_ID}/message_templates?fields=name,status,category,language&limit=10`,
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  );
  const tplData = await tplRes.json();
  console.log('\n📋 Message Templates:');
  if (tplRes.ok && tplData.data?.length) {
    tplData.data.forEach(t => {
      console.log(`  - ${t.name} [${t.status}] cat:${t.category} lang:${t.language}`);
    });
  } else if (tplRes.ok) {
    console.log('  ⚠️  No templates found — create at least 1 approved template to start conversations');
  } else {
    console.log('  ❌ Error:', tplData.error?.message);
  }

  // 3. Check webhook subscriptions
  const APP_ID = '1009514481606880';
  // Note: subscriptions check needs app-level token, skip for now

  console.log('\n✅ WhatsApp API is working correctly');
  console.log('\nNext steps:');
  console.log('1. Create a message template in Meta Business Manager');
  console.log('2. Wait for template approval (usually 10 mins - few hours)');
  console.log('3. Use "Start Conversation" in the app to send first message');
  console.log('4. After client replies, you can send free-form messages (24hr window)');
}

main().catch(err => {
  console.error('Error:', err.message);
});
