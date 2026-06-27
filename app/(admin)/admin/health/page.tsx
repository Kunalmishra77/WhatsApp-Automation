import { HealthMonitor } from '@/modules/admin/components/HealthMonitor';

export default function HealthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
        <p className="text-sm text-gray-500 mt-0.5">Real-time platform monitoring</p>
      </div>
      <HealthMonitor />
    </div>
  );
}
