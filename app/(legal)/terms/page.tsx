import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of Service — V4TOU Tech' };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg">V</div>
          <span className="text-xl font-bold text-gray-900">V4TOU Tech</span>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-gray-500 mb-8">Last updated: May 30, 2026</p>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-700">

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2>
            <p>By contacting V4TOU Tech via WhatsApp or using our platform, you agree to these Terms of Service. If you do not agree, please do not use our services.</p>

          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">2. Services</h2>
            <p>V4TOU Tech provides:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Business automation solutions</li>
              <li>Website development services</li>
              <li>Technical consulting and support</li>
              <li>WhatsApp-based customer communication</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">3. WhatsApp Communication</h2>
            <p>When you message V4TOU Tech on WhatsApp:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>You consent to receive automated and manual replies from our team</li>
              <li>You agree to WhatsApp&apos;s Terms of Service</li>
              <li>You understand messages may be stored for service improvement</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">4. User Responsibilities</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Do not send spam, abusive, or illegal content</li>
              <li>Provide accurate information when requesting services</li>
              <li>Respect our team members in all communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">5. Intellectual Property</h2>
            <p>All content, designs, and software created by V4TOU Tech remain our intellectual property unless explicitly transferred via a written agreement.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">6. Limitation of Liability</h2>
            <p>V4TOU Tech is not liable for any indirect, incidental, or consequential damages arising from the use of our services or communication channels.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">7. Changes to Terms</h2>
            <p>We reserve the right to update these terms at any time. Continued use of our services constitutes acceptance of the updated terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">8. Contact</h2>
            <ul className="list-none space-y-1">
              <li>📧 Email: <a href="mailto:kunal.mishra.50999@gmail.com" className="text-blue-600">kunal.mishra.50999@gmail.com</a></li>
              <li>💬 WhatsApp: +91 80764 80965</li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  );
}
