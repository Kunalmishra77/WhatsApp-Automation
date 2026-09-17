-- 096_rls_advisories.sql
-- Close the 3 CRITICAL "RLS Disabled in Public" advisories. These tables are
-- accessed ONLY via the service-role admin client (server routes), which
-- bypasses RLS — so enabling RLS with a workspace-member policy blocks direct
-- anon/authenticated access (the IDOR gap) without breaking any app flow.

-- campaign_queue
alter table public.campaign_queue enable row level security;
drop policy if exists "campaign_queue_ws" on public.campaign_queue;
create policy "campaign_queue_ws" on public.campaign_queue
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- media_library
alter table public.media_library enable row level security;
drop policy if exists "media_library_ws" on public.media_library;
create policy "media_library_ws" on public.media_library
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- vector_documents
alter table public.vector_documents enable row level security;
drop policy if exists "vector_documents_ws" on public.vector_documents;
create policy "vector_documents_ws" on public.vector_documents
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
