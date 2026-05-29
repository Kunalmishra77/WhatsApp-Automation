'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchContacts, fetchContact, createContact, updateContact, deleteContact,
} from '../services/contact.service';
import type { ContactFilters, ContactInsert, ContactUpdate } from '../services/contact.service';
import { useWorkspaceStore } from '@/store/workspace.store';

export function useContacts(filters: ContactFilters = {}, page = 0) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['contacts', workspaceId, filters, page],
    queryFn: () => fetchContacts(workspaceId!, filters, page),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useContact(id: string | null) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: () => fetchContact(id!),
    enabled: !!id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (payload: Omit<ContactInsert, 'workspace_id'>) =>
      createContact(workspaceId!, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts', workspaceId] });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ContactUpdate }) =>
      updateContact(id, payload),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['contact', id] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (id: string) => deleteContact(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts', workspaceId] });
    },
  });
}
