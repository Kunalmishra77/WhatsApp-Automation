import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy — V4TOU Tech' };

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg">V</div>
          <span className="text-xl font-bold text-gray-900">V4TOU Tech</span>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-gray-500 mb-8">Last updated: May 30, 2026</p>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-700">

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">1. Introduction</h2>
            <p>V4TOU Tech ("we", "our", or "us") operates a WhatsApp-based business communication platform. This Privacy Policy explains how we collect, use, and protect your personal information when you interact with us via WhatsApp or our web application.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">2. Information We Collect</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>WhatsApp Phone Number</strong> — when you message us on WhatsApp</li>
              <li><strong>Display Name</strong> — your WhatsApp profile name</li>
              <li><strong>Message Content</strong> — messages you send to us for support or inquiries</li>
              <li><strong>Business Information</strong> — name, email, company details you share with us</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To respond to your inquiries and provide customer support</li>
              <li>To send automated acknowledgment messages via WhatsApp</li>
              <li>To improve our services and communication</li>
              <li>To send relevant updates about our services (with your consent)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">4. WhatsApp Data</h2>
            <p>We use the WhatsApp Business API provided by Meta Platforms, Inc. Messages sent through WhatsApp are subject to <a href="https://www.whatsapp.com/legal/privacy-policy" className="text-blue-600 underline" target="_blank">WhatsApp's Privacy Policy</a> in addition to this policy. We do not share your WhatsApp data with third parties except as required to operate our services.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">5. Data Storage & Security</h2>
            <p>Your data is stored securely using Supabase (PostgreSQL) with industry-standard encryption. We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">6. Data Retention</h2>
            <p>We retain your conversation data for up to 12 months. You may request deletion of your data at any time by contacting us.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">7. Your Rights</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access your personal data we hold</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Opt out of marketing communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">8. Contact Us</h2>
            <p>For any privacy-related questions or requests:</p>
            <ul className="list-none pl-0 space-y-1 mt-2">
              <li>📧 Email: <a href="mailto:kunal.mishra.50999@gmail.com" className="text-blue-600">kunal.mishra.50999@gmail.com</a></li>
              <li>💬 WhatsApp: +91 80764 80965</li>
              <li>🌐 Website: <a href="https://whatsapp-automation-kohl-six.vercel.app" className="text-blue-600">V4TOU Tech Platform</a></li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  );
}
