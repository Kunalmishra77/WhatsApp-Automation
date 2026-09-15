import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of Service — AGENTiX' };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg">A</div>
          <span className="text-xl font-bold text-gray-900">AGENTiX</span>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-gray-500 mb-8">Last updated: September 15, 2026</p>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-700">

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2>
            <p>By creating an account or using the AGENTiX platform (operated by AI Agentix), you agree to these Terms of Service. If you do not agree, please do not use the service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">2. The Service</h2>
            <p>AGENTiX provides a multi-channel marketing and customer-communication platform, including:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>WhatsApp &amp; Instagram customer conversations, automation, and AI-assisted replies</li>
              <li>Campaigns, templates, CRM, leads, analytics, and reporting</li>
              <li>Optional integrations you choose to connect, including Google Business Profile and Google Ads</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">3. Connected Accounts &amp; Google APIs</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Connecting a Google, Meta, or other account is optional and done through that provider&apos;s official authorization flow. You may disconnect at any time.</li>
              <li>When you connect Google Business Profile or Google Ads, you authorize AGENTiX to access the data and perform the actions needed for the features you enable. Your use of those Google services remains subject to Google&apos;s own terms and policies.</li>
              <li>You are responsible for having the right to connect the accounts and manage the profiles you add, and for the content published on your behalf.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">4. Acceptable Use</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Do not use the platform to send spam, abusive, misleading, or illegal content.</li>
              <li>Comply with WhatsApp, Meta, and Google policies, and with applicable messaging and advertising laws.</li>
              <li>Provide accurate information and keep your account credentials secure.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">5. Data &amp; Privacy</h2>
            <p>Our handling of your data — including data obtained through Google APIs — is described in our{' '}
              <a href="/privacy-policy" className="text-blue-600 underline">Privacy Policy</a>, which forms part of these Terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">6. Intellectual Property</h2>
            <p>The AGENTiX platform, software, and content are the intellectual property of AI Agentix. Content and data you upload remain yours; you grant us the limited rights needed to operate the service for you.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">7. Fees</h2>
            <p>Paid plans and add-ons are billed as described at checkout. Fees are non-refundable except where required by law or expressly stated.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">8. Limitation of Liability</h2>
            <p>AGENTiX is provided &quot;as is&quot;. To the maximum extent permitted by law, AI Agentix is not liable for any indirect, incidental, or consequential damages arising from use of the service or connected third-party platforms.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">9. Changes to Terms</h2>
            <p>We may update these terms from time to time. Continued use of the service after changes take effect constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">10. Contact</h2>
            <ul className="list-none space-y-1">
              <li>📧 Email: <a href="mailto:aiagentix2025@gmail.com" className="text-blue-600">aiagentix2025@gmail.com</a></li>
              <li>🌐 Website: <a href="https://ai-agentix.com" className="text-blue-600" target="_blank" rel="noopener noreferrer">ai-agentix.com</a></li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  );
}
