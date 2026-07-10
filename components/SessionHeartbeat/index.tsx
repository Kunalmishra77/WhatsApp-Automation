'use client';

import { useEffect } from 'react';

const INTERVAL_MS = 60_000; // 60 seconds

export function SessionHeartbeat() {
  useEffect(() => {
    const ping = () => fetch('/api/session/heartbeat', { method: 'POST' }).catch(() => {});
    ping(); // ping immediately on mount
    const id = setInterval(ping, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
