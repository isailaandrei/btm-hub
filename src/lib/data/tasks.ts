import { cache } from "react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminTask,
  TaskComment,
  TaskGroup,
  TaskGroupColor,
  TaskPriority,
  TaskStatus,
} from "@/types/database";

export const TASK_GROUP_SELECT =
  "id, name, color, sort_order, archived_at, archived_by, created_by, updated_by, created_at, updated_at";
export const TASK_SELECT =
  "id, group_id, title, description, assignee_id, due_date, status, priority, sort_order, completed_at, archived_at, archived_by, created_by, updated_by, created_at, updated_at";
export const TASK_COMMENT_SELECT =
  "id, task_id, author_id, author_name, body, created_at";

function hasOwn<T extends object, K extends PropertyKey>(
  object: T,
  key: K,
): object is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export const getTaskGroups = cache(async function getTaskGroups() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_groups")
    .select(TASK_GROUP_SELECT)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load task groups: ${error.message}`);
  return (data ?? []) as TaskGroup[];
});

export async function createTaskGroup(input: {
  name: string;
  color: TaskGroupColor;
}) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_task_group", {
    p_name: input.name,
    p_color: input.color,
  });

  if (error) throw new Error(`Failed to create task group: ${error.message}`);
  return data as TaskGroup;
}

export async function updateTaskGroup(
  groupId: string,
  patch: Partial<{ name: string; color: TaskGroupColor }>,
) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_task_group", {
    p_group_id: groupId,
    p_name: patch.name ?? null,
    p_color: patch.color ?? null,
  });

  if (error) throw new Error(`Failed to update task group: ${error.message}`);
  return data as TaskGroup;
}

export async function archiveTaskGroup(groupId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_task_group", {
    p_group_id: groupId,
  });

  if (error) throw new Error(`Failed to archive task group: ${error.message}`);
}

export async function createTask(input: {
  groupId: string;
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
  status: TaskStatus;
  priority: TaskPriority;
}) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_task", {
    p_group_id: input.groupId,
    p_title: input.title,
    p_description: input.description,
    p_assignee_id: input.assigneeId,
    p_due_date: input.dueDate,
    p_status: input.status,
    p_priority: input.priority,
  });

  if (error) throw new Error(`Failed to create task: ${error.message}`);
  return data as AdminTask;
}

export async function updateTask(
  taskId: string,
  patch: Partial<{
    title: string;
    description: string;
    assigneeId: string | null;
    dueDate: string | null;
    status: TaskStatus;
    priority: TaskPriority;
  }>,
) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_task", {
    p_task_id: taskId,
    p_title: patch.title ?? null,
    p_description: patch.description ?? null,
    p_assignee_id: patch.assigneeId ?? null,
    p_clear_assignee: hasOwn(patch, "assigneeId") && patch.assigneeId === null,
    p_due_date: patch.dueDate ?? null,
    p_clear_due_date: hasOwn(patch, "dueDate") && patch.dueDate === null,
    p_status: patch.status ?? null,
    p_priority: patch.priority ?? null,
  });

  if (error) throw new Error(`Failed to update task: ${error.message}`);
  return data as AdminTask;
}

export async function archiveTask(taskId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_task", {
    p_task_id: taskId,
  });

  if (error) throw new Error(`Failed to archive task: ${error.message}`);
}

export async function getTaskComments(taskId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_comments")
    .select(TASK_COMMENT_SELECT)
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load task comments: ${error.message}`);
  return (data ?? []) as TaskComment[];
}

export async function createTaskComment(input: {
  taskId: string;
  body: string;
}) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_task_comment", {
    p_task_id: input.taskId,
    p_body: input.body,
  });

  if (error) throw new Error(`Failed to create task comment: ${error.message}`);
  return data as TaskComment;
}

export async function reorderTaskGroups(groupIds: string[]) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_task_groups", {
    p_group_ids: groupIds,
  });

  if (error) throw new Error(`Failed to reorder task groups: ${error.message}`);
}

export async function reorderTasks(groupId: string, taskIds: string[]) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_active_tasks", {
    p_group_id: groupId,
    p_task_ids: taskIds,
  });

  if (error) throw new Error(`Failed to reorder tasks: ${error.message}`);
}

export async function moveTaskToGroup(input: {
  taskId: string;
  targetGroupId: string;
  targetTaskIds: string[];
}) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_active_task_to_group", {
    p_task_id: input.taskId,
    p_target_group_id: input.targetGroupId,
    p_target_task_ids: input.targetTaskIds,
  });

  if (error) throw new Error(`Failed to move task: ${error.message}`);
}
