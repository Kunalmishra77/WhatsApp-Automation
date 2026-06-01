/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/services/supabase/client';
import type { ChatbotFlow } from '../types';

export async function fetchFlows(workspaceId: string): Promise<ChatbotFlow[]> {
  const res = await fetch(`/api/flows?workspaceId=${workspaceId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? 'Failed to fetch flows');
  return (data.flows ?? []) as ChatbotFlow[];
}

export async function fetchFlow(id: string): Promise<ChatbotFlow> {
  const res = await fetch(`/api/flows/${id}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? 'Failed to fetch flow');
  return data.flow as ChatbotFlow;
}

export async function createFlow(workspaceId: string, name: string): Promise<ChatbotFlow> {
  const res = await fetch('/api/flows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? 'Failed to create flow');
  return data.flow as ChatbotFlow;
}

export async function updateFlow(
  id: string,
  patch: Partial<ChatbotFlow>,
): Promise<ChatbotFlow> {
  const res = await fetch(`/api/flows/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? 'Failed to update flow');
  return data.flow as ChatbotFlow;
}

export async function deleteFlow(id: string): Promise<void> {
  const res = await fetch(`/api/flows/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data?.error ?? 'Failed to delete flow');
  }
}
