import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

function generateSlug(businessName: string): string {
  const base = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base}-${suffix}`;
}

function generatePassword(): string {
  // Cryptographically random 16-char password
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => chars[b % chars.length])
    .join('');
}

const VALID_PLANS = ['free', 'starter', 'pro', 'enterprise'] as const;

export async function POST(request: NextRequest) {
  try {
    // 1. Get current user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Check is_platform_admin
    const db = createAdminClient() as any;
    const { data: profile } = await db
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single();
    if (!profile?.is_platform_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Parse and validate body
    const body = await request.json() as {
      business_name: string;
      owner_email: string;
      owner_phone?: string;
      plan: string;
      industry?: string;
    };

    const { business_name, owner_email, owner_phone, plan, industry } = body;

    if (!business_name?.trim()) {
      return NextResponse.json({ error: 'business_name is required' }, { status: 400 });
    }
    if (!owner_email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner_email)) {
      return NextResponse.json({ error: 'A valid owner_email is required' }, { status: 400 });
    }
    if (!plan?.trim() || !VALID_PLANS.includes(plan as typeof VALID_PLANS[number])) {
      return NextResponse.json(
        { error: `plan must be one of: ${VALID_PLANS.join(', ')}` },
        { status: 400 },
      );
    }

    // 4. Create Supabase auth user
    const password = generatePassword();
    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email: owner_email,
      password,
      email_confirm: true,
    });

    if (authError) {
      console.error('[admin/create-client] createUser error:', authError);
      // Handle duplicate email
      if (
        authError.message?.toLowerCase().includes('already') ||
        authError.message?.toLowerCase().includes('exists') ||
        authError.code === '23505'
      ) {
        return NextResponse.json(
          { error: 'A user with this email already exists' },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: authError.message ?? 'Failed to create user' }, { status: 500 });
    }

    const newUser = authData.user;
    if (!newUser) {
      return NextResponse.json({ error: 'User creation returned no data' }, { status: 500 });
    }

    const slug = generateSlug(business_name);

    // 5. Create workspace
    const { data: workspace, error: wsError } = await db
      .from('workspaces')
      .insert({
        name: business_name,
        slug,
        plan,
        owner_email,
        owner_phone: owner_phone ?? null,
        industry: industry ?? null,
        onboarding_complete: false,
        is_active: false,
        subscription_status: 'pending_approval',
      })
      .select('id')
      .single();

    if (wsError || !workspace) {
      console.error('[admin/create-client] workspace insert error:', wsError);
      return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 });
    }

    const workspaceId = workspace.id as string;

    // 6. Create workspace_members entry
    const { error: memberError } = await db.from('workspace_members').insert({
      workspace_id: workspaceId,
      user_id: newUser.id,
      role: 'super_admin',
    });

    if (memberError) {
      console.error('[admin/create-client] workspace_members insert error:', memberError);
      // Non-fatal — workspace was created
    }

    // 7. Create profile
    const { error: profileError } = await db.from('profiles').upsert({
      id: newUser.id,
      full_name: business_name,
      email: owner_email,
    });

    if (profileError) {
      console.error('[admin/create-client] profile upsert error:', profileError);
      // Non-fatal
    }

    // 8. Send invite email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.agentix.in';

    if (resendKey) {
      try {
        const loginLink = `${appUrl}/login`;
        const emailHtml = `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
            <div style="background: #6366f1; border-radius: 8px; padding: 16px 24px; margin-bottom: 24px;">
              <h1 style="color: white; margin: 0; font-size: 22px;">Agentix</h1>
            </div>
            <h2 style="color: #111827; font-size: 20px;">Your Agentix account is ready!</h2>
            <p style="color: #374151;">Hello,</p>
            <p style="color: #374151;">
              Your workspace <strong>${business_name}</strong> has been created on Agentix — the AI-powered WhatsApp CRM.
              Here are your login credentials:
            </p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; font-family: monospace;">
              <p style="margin: 0 0 8px; color: #374151;"><strong>Login URL:</strong> <a href="${loginLink}" style="color: #6366f1;">${loginLink}</a></p>
              <p style="margin: 0 0 8px; color: #374151;"><strong>Email:</strong> ${owner_email}</p>
              <p style="margin: 0; color: #374151;"><strong>Password:</strong> ${password}</p>
            </div>
            <p style="color: #374151; font-size: 14px;">
              After logging in, you will be taken through a quick setup wizard where you'll connect your WhatsApp Business account and choose your plan.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${loginLink}" style="background: #6366f1; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
                Log In to Agentix →
              </a>
            </div>
            <p style="color: #6b7280; font-size: 12px; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
              For security, please change your password after your first login via Settings → Profile.
            </p>
          </div>
        `;

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Agentix <onboarding@resend.dev>',
            to: [owner_email],
            subject: `Your Agentix account is ready — ${business_name}`,
            html: emailHtml,
          }),
        });
        const emailData = await emailRes.json();
        if (!emailRes.ok) {
          console.error('[admin/create-client] Resend error:', JSON.stringify(emailData));
        } else {
          console.log('[admin/create-client] Email sent, id:', (emailData as any).id);
        }
      } catch (emailErr) {
        console.error('[admin/create-client] email send error:', emailErr);
        // Non-fatal — account was created
      }
    }

    // Always return the password so admin can share it manually if email fails
    return NextResponse.json({ success: true, workspaceId, userId: newUser.id, password, owner_email });
  } catch (err) {
    console.error('[admin/create-client] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
