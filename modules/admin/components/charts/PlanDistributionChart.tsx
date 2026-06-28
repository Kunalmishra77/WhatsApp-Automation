'use client';

import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

const COLORS: Record<string, string> = {
  free: '#9CA3AF', starter: '#2563EB', pro: '#8B5CF6', enterprise: '#F97316',
};

interface Props {
  data: Array<{ plan: string; count: number; revenue: number }>;
}

export function PlanDistributionChart({ data }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Skeleton className="h-[180px] w-full" />;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3}
          dataKey="count" nameKey="plan">
          {data.map((entry) => (
            <Cell key={entry.plan} fill={COLORS[entry.plan] ?? '#6B7280'} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number, name: string) => [v, name.charAt(0).toUpperCase() + name.slice(1)]}
          contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB' }} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) => value.charAt(0).toUpperCase() + value.slice(1)} />
      </PieChart>
    </ResponsiveContainer>
  );
}
