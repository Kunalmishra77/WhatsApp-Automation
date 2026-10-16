import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { resolveMemberAccess } from '@/lib/permissions';

// GET /api/team/my-access?workspaceId=
// The CURRENT user's resolved access in this workspace — their role, the
// permissions they actually hold and the pages they may open.
//
// The Sidebar and client-side guards read this instead of the workspace-wide
// agent list they used to read, so per-member access and custom roles show up
// in the UI exactly as the server enforces them.
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await resolveMemberAccess(workspaceId, user.id);
  if (!access) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });

  return NextResponse.json({
    role:           access.role,
    customRoleName: access.customRoleName,
    isSuspended:    access.isSuspended,
    permissions:    access.permissions,
    // null = not page-restricted; the client must treat that as "show everything".
    pageAccess:     access.pageAccess,
  });
}
