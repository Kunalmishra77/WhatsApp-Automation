import { BotHealth } from '@/modules/admin/components/BotHealth';

export default function BotHealthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bot Health</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Where the AI is turning customers away, failing, or replying slowly — per client
        </p>
      </div>
      <BotHealth />
    </div>
  );
}
