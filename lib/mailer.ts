// Central mailer — uses Gmail SMTP if configured, else Resend fallback
// Set SMTP_USER and SMTP_PASS (Gmail app password) in env to enable Gmail

interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

async function sendViaGmail(opts: MailOptions): Promise<void> {
  const nodemailer = await import('nodemailer');
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    // Fail fast — don't hang the caller for 60s if SMTP is unreachable
    connectionTimeout: 8000,
    greetingTimeout:   5000,
    socketTimeout:     10000,
  });

  await transporter.sendMail({
    from: opts.from ?? `Agentix <${user}>`,
    to:   Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
    subject: opts.subject,
    html:    opts.html,
  });
}

async function sendViaResend(opts: MailOptions): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('No email provider configured (SMTP_PASS or RESEND_API_KEY required)');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: opts.from ?? 'Agentix <onboarding@resend.dev>',
      to:   Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html:    opts.html,
    }),
  });
  if (!res.ok) {
    const err = await res.json() as { message?: string };
    throw new Error(err.message ?? 'Resend error');
  }
}

export async function sendMail(opts: MailOptions): Promise<{ ok: boolean; error?: string }> {
  try {
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS?.trim();

    if (smtpUser && smtpPass) {
      await sendViaGmail(opts);
    } else {
      await sendViaResend(opts);
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mailer]', msg);
    return { ok: false, error: msg };
  }
}
