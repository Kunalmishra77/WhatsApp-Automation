'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  data: Array<{ month: string; mrr: number; clients: number }>;
}

export function RevenueChart({ data }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Skeleton className="h-[220px] w-full" />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
          tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          formatter={(v: number, name: string) => name === 'mrr' ? [`₹${v.toLocaleString('en-IN')}`, 'MRR'] : [v, 'Clients']}
          contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="mrr" stroke="#F97316" strokeWidth={2.5} dot={false} name="MRR" />
      </LineChart>
    </ResponsiveContainer>
  );
}
