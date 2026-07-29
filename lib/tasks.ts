// Pure helpers for task management, shared by the API routes and UI.

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** completed_at value for a status change: the timestamp when done, else null. */
export function completedAtForStatus(status: string, nowIso: string): string | null {
  return status === 'done' ? nowIso : null;
}

/** A task is overdue when it has a past due date and is not yet done. */
export function isOverdue(dueDate: string | null | undefined, status: string, nowMs: number): boolean {
  if (!dueDate || status === 'done') return false;
  const due = Date.parse(dueDate);
  return Number.isFinite(due) && due < nowMs;
}

/** Validates create/update input. Returns an error message, or null when valid. */
export function validateTaskInput(input: { title?: string; priority?: string; status?: string }): string | null {
  if (input.title !== undefined && !input.title.trim()) return 'A task title is required.';
  if (input.priority !== undefined && !TASK_PRIORITIES.includes(input.priority as TaskPriority)) {
    return `Invalid priority. Use one of: ${TASK_PRIORITIES.join(', ')}.`;
  }
  if (input.status !== undefined && !TASK_STATUSES.includes(input.status as TaskStatus)) {
    return `Invalid status. Use one of: ${TASK_STATUSES.join(', ')}.`;
  }
  return null;
}
