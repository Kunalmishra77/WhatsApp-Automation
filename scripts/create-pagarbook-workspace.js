// Create workspace for Pagar Book client with WhatsApp credentials
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yvqaproltcskufufmomi.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cWFwcm9sdGNza3VmdWZtb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDA2NDc3MiwiZXhwIjoyMDk1NjQwNzcyfQ.hv81ELR5VR8qlkqASiXUz5WEm7Um8BZ8HNeL6WGcslA';

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Client credentials
const CLIENT = {
  business_name: 'Pagar Book',
  slug: 'pagar-book',
  plan: 'starter',
  owner_email: null,         // Will be filled when client signs up
  waba_id: '1708964607185517',
  phone_number_id: '1173335072523347',
  access_token: 'EAAOWJegSYOABRT8n2r7Hhe1pWiBOvYQfk8UwkiWnlRVLnxgOyYlgSuSnzwZAl28abUdePhzUKeGCZBWI13WNPGFEgQMijh7nGmzGptZBhuUqSLGpFsQ3WodaTe25hT9e0TNZABu1pyHpnA5cANIJxZBBl6CC0ZAzGZAvzREtfUZAoOWkCVE5JwmJceDan2drkgZDZD',
  webhook_secret: 'agentix-webhook-secret-2026',
};

async function main() {
  console.log('=== Creating Pagar Book Workspace ===\n');

  // Check if slug already exists
  const { data: existing } = await db.from('workspaces').select('id').eq('slug', CLIENT.slug).single();
  if (existing) {
    console.log('Workspace with slug "pagar-book" already exists:', existing.id);
    console.log('Updating WhatsApp credentials...');
    await db.from('workspaces').update({
      waba_id: CLIENT.waba_id,
      phone_number_id: CLIENT.phone_number_id,
      access_token: CLIENT.access_token,
      webhook_secret: CLIENT.webhook_secret,
      onboarding_complete: true,
      subscription_status: 'active',
      is_active: true,
    }).eq('id', existing.id);
    console.log('Updated. Workspace ID:', existing.id);
    return;
  }

  // Create workspace
  const { data: workspace, error: wsErr } = await db.from('workspaces').insert({
    name: CLIENT.business_name,
    slug: CLIENT.slug,
    plan: CLIENT.plan,
    waba_id: CLIENT.waba_id,
    phone_number_id: CLIENT.phone_number_id,
    access_token: CLIENT.access_token,
    webhook_secret: CLIENT.webhook_secret,
    is_active: true,
    subscription_status: 'active',
    onboarding_complete: true,
  }).select('id').single();

  if (wsErr) {
    console.error('Failed to create workspace:', wsErr.message);
    process.exit(1);
  }

  console.log('✅ Workspace created!');
  console.log('   Name:', CLIENT.business_name);
  console.log('   Slug:', CLIENT.slug);
  console.log('   ID  :', workspace.id);
  console.log('   WABA:', CLIENT.waba_id);
  console.log('   Phone Number ID:', CLIENT.phone_number_id);
  console.log('   WhatsApp: Connected ✓');
  console.log('\n⚠️  No auth user created yet.');
  console.log('   Client should sign up at the portal to get access.');
  console.log('   After signup, link them to this workspace via Admin Panel.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
