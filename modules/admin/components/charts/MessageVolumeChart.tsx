'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  data: Array<{ date: string; sent: number; received: number }>;
}

export function MessageVolumeChart({ data }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Skeleton className="h-[220px] w-full" />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }} barSize={8}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
          interval={Math.floor(data.length / 6)} />
        <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB' }} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="sent"     fill="#F97316" radius={[3, 3, 0, 0]} name="Sent" />
        <Bar dataKey="received" fill="#2563EB" radius={[3, 3, 0, 0]} name="Received" />
      </BarChart>
    </ResponsiveContainer>
  );
}
