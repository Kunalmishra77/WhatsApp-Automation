'use client';

import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

interface Props { workspaceId: string }

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-amber-100 text-amber-700',
  admin:       'bg-violet-100 text-violet-700',
  manager:     'bg-blue-100 text-blue-700',
  agent:       'bg-gray-100 text-gray-600',
};

interface MemberRow {
  id: string;
  role: string;
  is_online: boolean;
  created_at: string;
  profiles: {
    id:         string;
    full_name:  string | null;
    email:      string | null;
    avatar_url: string | null;
  } | null;
}

export function MembersTab({ workspaceId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'workspace', workspaceId, 'members'],
    queryFn:  () => fetch(`/api/admin/workspaces/${workspaceId}/members`).then(r => r.json()),
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const members: MemberRow[] = data?.members ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        {members.length} team member{members.length !== 1 ? 's' : ''}
      </p>
      {members.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No members found</p>
      ) : (
        members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div className="h-9 w-9 rounded-full bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-600 shrink-0">
              {m.profiles?.full_name?.[0]?.toUpperCase()
                ?? m.profiles?.email?.[0]?.toUpperCase()
                ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{m.profiles?.full_name ?? 'Unknown'}</p>
              <p className="text-xs text-gray-400">{m.profiles?.email ?? ''}</p>
            </div>
            <div className="flex items-center gap-2">
              {m.is_online && (
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="Online" />
              )}
              <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${ROLE_COLORS[m.role] ?? 'bg-gray-100 text-gray-600'}`}>
                {m.role?.replace('_', ' ')}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
