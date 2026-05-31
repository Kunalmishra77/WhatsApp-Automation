import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Data Deletion — V4TOU Tech' };

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-white py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg">V</div>
          <span className="text-xl font-bold text-gray-900">V4TOU Tech</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Data Deletion Request</h1>
        <p className="text-gray-600 mb-6">To request deletion of your data from V4TOU Tech, please contact us:</p>
        <div className="bg-gray-50 rounded-xl p-6 space-y-3">
          <p>📧 <strong>Email:</strong> <a href="mailto:kunal.mishra.50999@gmail.com" className="text-blue-600">kunal.mishra.50999@gmail.com</a></p>
          <p>💬 <strong>WhatsApp:</strong> +91 80764 80965</p>
        </div>
        <p className="text-gray-500 text-sm mt-6">We will process your request within 30 days.</p>
      </div>
    </div>
  );
}
