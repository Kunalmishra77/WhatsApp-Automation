# Task Management — Design Spec

**Date:** 2026-07-29
**Goal:** Let a client assign and track tasks for their team ("employees") inside the platform — assign, set priority/due date, optionally link to a contact/conversation, track status to completion, and notify the assignee.

## Decisions (approved)
- View: **grouped list** — To Do · In Progress · Done (status control per card); no drag-drop in v1.
- Tasks can **optionally link** to a contact and/or conversation.
- **Notify** the assignee on assignment (reuse the `notifications` table).

## Data model — migration `058_tasks.sql`
`public.tasks`:
- `id uuid pk`, `workspace_id uuid not null → workspaces on delete cascade`
- `title varchar(255) not null`, `description text`
- `assigned_to uuid → profiles on delete set null`, `created_by uuid → profiles on delete set null`
- `status varchar(20) not null default 'todo' check in ('todo','in_progress','done')`
- `priority varchar(10) not null default 'medium' check in ('low','medium','high')`
- `due_date timestamptz`, `completed_at timestamptz`
- `related_contact_id uuid → contacts on delete set null`, `related_conversation_id uuid → conversations on delete set null`
- `created_at/updated_at timestamptz default now()`
- Indexes: `(workspace_id, status)`, `(workspace_id, assigned_to)`. RLS: `FOR ALL USING is_workspace_member(workspace_id)` (both USING + WITH CHECK), matching sibling tables.

## API (auth: `requireWorkspacePermission(workspaceId, 'handle_conversations')` — the permission every team member holds)
- `GET /api/tasks?workspaceId=&status=&assignedTo=` → tasks + joined `assignee:profiles(full_name,email)`, `creator`, `contacts(name,phone)`; ordered by status then due_date. Members see all workspace tasks.
- `POST /api/tasks` `{ workspaceId, title, description?, assigned_to?, priority?, due_date?, related_contact_id?, related_conversation_id? }` → insert with `created_by = current user`; if `assigned_to` set and ≠ creator, insert a `notifications` row (`type:'task_assigned'`, title/body naming the task).
- `PATCH /api/tasks/[id]` `{ status?, assigned_to?, title?, description?, priority?, due_date? }` → update; when `status → 'done'` set `completed_at=now()` (clear it otherwise); notify on (re)assignment.
- `DELETE /api/tasks/[id]`.

## UI
- **`app/(dashboard)/tasks/page.tsx`** → `requirePageRole('tasks')` → `<TaskBoard/>`.
- **`modules/tasks/components/TaskBoard`** — `useTasks()` (react-query) → three columns grouped by status; header with an **assignee filter** and a **"New Task"** button. Empty-state per column.
- **`modules/tasks/components/NewTaskDialog`** — title, description, **assignee** (team-member dropdown via `useTeamMembers`/`workspace_members`+profiles), priority, due date, optional contact link.
- **`modules/tasks/components/TaskCard`** — title, priority pill, assignee avatar/name, due date (red if overdue), a **status control** (todo→in_progress→done), a link chip to the related contact/conversation, and a delete action (creator/manager).
- **`modules/tasks/hooks/useTasks.ts`** — react-query list + create/update/delete mutations (matches existing module hook patterns).
- **Sidebar** (`components/layout/Sidebar/index.tsx`): add `{ href:'/tasks', icon: CheckSquare, label:'Tasks', agentPageKey:'tasks' }`.
- **Page access:** `agentPageKey:'tasks'` so the Team → Page Access rules govern which roles see it (agents included by default).

## Non-goals (YAGNI)
- No subtasks, comments, attachments, recurring tasks, or drag-drop in v1.
- No email/WhatsApp notification (in-app only).

## Testing
- Unit-test the pure task helpers: `taskStatusOnUpdate(status)` (sets/clears `completed_at`), `isOverdue(due_date, status)`, and the create-payload validation (title required, valid enums). Pure, in `tests/tasks.test.ts`.
- Verify the migration applies + a create/list/update round-trip against live DB; `tsc` + `next build` clean.
