/**
 * Email Templates Module
 * Centralized email template functions for Agentix SaaS platform
 */

export interface EmailTemplate {
  subject: string;
  html: string;
}

/**
 * Invite Client Email
 * Sent when a new client is created
 */
export function inviteClientEmail(params: {
  businessName: string;
  planName: string;
  loginUrl: string;
}): EmailTemplate {
  const { businessName, planName, loginUrl } = params;

  return {
    subject: `Welcome to Agentix - Your ${planName} Plan Awaits`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
          <div style="background-color: #4f46e5; padding: 24px; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">Agentix</h1>
          </div>

          <div style="background-color: white; max-width: 600px; margin: 0 auto; padding: 32px; border-radius: 8px; margin-top: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
            <h2 style="margin: 0 0 16px 0; color: #1f2937; font-size: 24px; font-weight: 600;">Welcome, ${businessName}!</h2>

            <p style="margin: 0 0 16px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              Your Agentix account has been created with the <strong>${planName}</strong> plan. You're all set to automate your WhatsApp marketing and customer engagement.
            </p>

            <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              Click the button below to access your dashboard and get started.
            </p>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${loginUrl}" style="background-color: #0ea5e9; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">
                Access Your Dashboard
              </a>
            </div>

            <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
              Questions? Reply to this email or visit our support center. We're here to help you succeed.
            </p>
          </div>

          <div style="background-color: #f9fafb; text-align: center; padding: 24px; margin-top: 16px;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">© 2024 Agentix. All rights reserved.</p>
          </div>
        </body>
      </html>
    `,
  };
}

/**
 * Payment Success Email
 * Sent after successful payment processing
 */
export function paymentSuccessEmail(params: {
  businessName: string;
  dashboardUrl: string;
}): EmailTemplate {
  const { businessName, dashboardUrl } = params;

  return {
    subject: "Payment Successful - Your Agentix Subscription is Active",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
          <div style="background-color: #4f46e5; padding: 24px; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">Agentix</h1>
          </div>

          <div style="background-color: white; max-width: 600px; margin: 0 auto; padding: 32px; border-radius: 8px; margin-top: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
            <div style="text-align: center; margin: 0 0 24px 0;">
              <div style="display: inline-block; width: 56px; height: 56px; background-color: #10b981; border-radius: 50%; text-align: center; line-height: 56px;">
                <span style="color: white; font-size: 32px; font-weight: bold;">✓</span>
              </div>
            </div>

            <h2 style="margin: 0 0 16px 0; color: #1f2937; font-size: 24px; font-weight: 600; text-align: center;">Payment Successful!</h2>

            <p style="margin: 0 0 16px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              Thank you, ${businessName}! Your payment has been processed successfully. Your subscription is now active and ready to use.
            </p>

            <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              You can now access all features included in your plan. Head to your dashboard to start creating campaigns and automating your customer engagement.
            </p>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${dashboardUrl}" style="background-color: #0ea5e9; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">
                Go to Dashboard
              </a>
            </div>

            <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
              If you have any questions about your subscription or need assistance, please don't hesitate to reach out.
            </p>
          </div>

          <div style="background-color: #f9fafb; text-align: center; padding: 24px; margin-top: 16px;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">© 2024 Agentix. All rights reserved.</p>
          </div>
        </body>
      </html>
    `,
  };
}

/**
 * Payment Retry Warning Email
 * Sent when a payment attempt fails and will be retried
 */
export function paymentRetryWarningEmail(params: {
  businessName: string;
}): EmailTemplate {
  const { businessName } = params;

  return {
    subject: "Payment Issue - We're Retrying Your Payment",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
          <div style="background-color: #4f46e5; padding: 24px; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">Agentix</h1>
          </div>

          <div style="background-color: white; max-width: 600px; margin: 0 auto; padding: 32px; border-radius: 8px; margin-top: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
            <div style="background-color: #fef3c7; padding: 16px; border-radius: 6px; margin: 0 0 24px 0; border-left: 4px solid #f59e0b;">
              <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 600;">Payment Retry Initiated</p>
            </div>

            <h2 style="margin: 0 0 16px 0; color: #1f2937; font-size: 24px; font-weight: 600;">Hi ${businessName},</h2>

            <p style="margin: 0 0 16px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              We encountered an issue processing your recent payment. Don't worry — we're automatically retrying your payment using your saved payment method.
            </p>

            <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              <strong>What's next?</strong> We'll keep you updated as we attempt to process your payment. You'll receive a confirmation email once the payment is successful.
            </p>

            <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
              If you continue to experience issues or have questions, please contact our support team immediately.
            </p>
          </div>

          <div style="background-color: #f9fafb; text-align: center; padding: 24px; margin-top: 16px;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">© 2024 Agentix. All rights reserved.</p>
          </div>
        </body>
      </html>
    `,
  };
}

/**
 * Payment Failed Final Email
 * Sent when all payment retry attempts have failed
 */
export function paymentFailedFinalEmail(params: {
  businessName: string;
  billingUrl: string;
}): EmailTemplate {
  const { businessName, billingUrl } = params;

  return {
    subject: "Action Required - Update Your Payment Method",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
          <div style="background-color: #4f46e5; padding: 24px; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">Agentix</h1>
          </div>

          <div style="background-color: white; max-width: 600px; margin: 0 auto; padding: 32px; border-radius: 8px; margin-top: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
            <div style="background-color: #fee2e2; padding: 16px; border-radius: 6px; margin: 0 0 24px 0; border-left: 4px solid #ef4444;">
              <p style="margin: 0; color: #7f1d1d; font-size: 14px; font-weight: 600;">Payment Failed - Immediate Action Required</p>
            </div>

            <h2 style="margin: 0 0 16px 0; color: #1f2937; font-size: 24px; font-weight: 600;">Hi ${businessName},</h2>

            <p style="margin: 0 0 16px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              We've been unable to process your payment after multiple attempts. Your subscription is now at risk of being suspended.
            </p>

            <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              <strong>What you need to do:</strong> Please update your payment method immediately to avoid service interruption. Click the button below to manage your billing settings.
            </p>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${billingUrl}" style="background-color: #ef4444; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">
                Update Payment Method
              </a>
            </div>

            <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
              If you have questions or need assistance, please contact our support team right away.
            </p>
          </div>

          <div style="background-color: #f9fafb; text-align: center; padding: 24px; margin-top: 16px;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">© 2024 Agentix. All rights reserved.</p>
          </div>
        </body>
      </html>
    `,
  };
}

/**
 * Usage Limit Warning Email
 * Sent when a metric approaches its plan limit
 */
export function usageLimitWarningEmail(params: {
  businessName: string;
  metric: string;
  used: number;
  limit: number;
  pct: number;
  upgradeUrl: string;
}): EmailTemplate {
  const { businessName, metric, used, limit, pct, upgradeUrl } = params;

  return {
    subject: `${pct}% of Your ${metric} Limit Reached - Consider Upgrading`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
          <div style="background-color: #4f46e5; padding: 24px; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">Agentix</h1>
          </div>

          <div style="background-color: white; max-width: 600px; margin: 0 auto; padding: 32px; border-radius: 8px; margin-top: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
            <h2 style="margin: 0 0 16px 0; color: #1f2937; font-size: 24px; font-weight: 600;">Usage Alert, ${businessName}</h2>

            <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              You're currently using <strong>${used}</strong> of your <strong>${limit}</strong> ${metric} limit (${pct}%). Your usage is approaching the maximum for your current plan.
            </p>

            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 24px 0;">
              <div style="margin: 0 0 12px 0;">
                <div style="background-color: #e5e7eb; height: 24px; border-radius: 12px; overflow: hidden;">
                  <div style="background-color: #0ea5e9; height: 100%; width: ${pct}%; border-radius: 12px;"></div>
                </div>
              </div>
              <p style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">
                ${used} / ${limit} ${metric}
              </p>
            </div>

            <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
              To continue growing without limitations, consider upgrading to a higher-tier plan. You'll get more ${metric}, advanced features, and priority support.
            </p>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${upgradeUrl}" style="background-color: #0ea5e9; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">
                View Upgrade Options
              </a>
            </div>

            <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
              Questions about your plan? Reach out to our support team.
            </p>
          </div>

          <div style="background-color: #f9fafb; text-align: center; padding: 24px; margin-top: 16px;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">© 2024 Agentix. All rights reserved.</p>
          </div>
        </body>
      </html>
    `,
  };
}

/**
 * Send Email Helper
 * Uses Resend REST API to send emails
 * Returns true on success, false on failure
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<boolean> {
  const {
    to,
    subject,
    html,
    from = "Agentix <noreply@agentix.in>",
  } = params;

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error("RESEND_API_KEY environment variable is not set");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to send email: ${response.statusText}`, error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}
