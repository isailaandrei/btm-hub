"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import {
  TASK_GROUP_SELECT,
  TASK_COMMENT_SELECT,
  TASK_SELECT,
} from "@/lib/data/tasks";
import type { AdminTask, TaskComment, TaskGroup } from "@/types/database";
import {
  TASK_DATE_BUCKET_ORDER,
  DEFAULT_DONE_TASK_LIMIT,
} from "./constants";
import {
  getTodayInBtmTimezone,
  type TaskDateBucket,
} from "./date-buckets";

export interface TaskDoneCursor {
  completedAt: string;
  id: string;
}

export interface TaskBoardData {
  groups: TaskGroup[];
  activeTasks: AdminTask[];
  doneTasks: AdminTask[];
  doneCountsByGroupId: Record<string, number>;
  doneCursorsByGroupId: Record<string, TaskDoneCursor | null>;
  today: string;
}

export interface TaskDateViewData {
  activeTasks: AdminTask[];
  doneTasks: AdminTask[];
  doneCountsByDateBucket: Record<TaskDateBucket, number>;
  doneCursorsByDateBucket: Record<TaskDateBucket, TaskDoneCursor | null>;
  today: string;
}

type CountRow = { group_id?: string; bucket?: string; done_count: number | string };
type DateBucketTaskRow = AdminTask & { bucket: TaskDateBucket };
const MAX_ACTIVE_TASKS = 1000;

function cursorFromTask(task: AdminTask | null | undefined): TaskDoneCursor | null {
  if (!task?.completed_at) return null;
  return { completedAt: task.completed_at, id: task.id };
}

function emptyBucketRecord<T>(value: T): Record<TaskDateBucket, T> {
  return Object.fromEntries(
    TASK_DATE_BUCKET_ORDER.map((bucket) => [bucket, value]),
  ) as Record<TaskDateBucket, T>;
}

function buildGroupCursors(doneTasks: AdminTask[]) {
  const byGroup: Record<string, TaskDoneCursor | null> = {};
  for (const task of doneTasks) {
    byGroup[task.group_id] = cursorFromTask(task);
  }
  return byGroup;
}

function buildBucketCursors(rows: DateBucketTaskRow[]) {
  const cursors = emptyBucketRecord<TaskDoneCursor | null>(null);
  for (const row of rows) {
    cursors[row.bucket] = cursorFromTask(row);
  }
  return cursors;
}

function mapDateBucketRows(rows: DateBucketTaskRow[]) {
  return rows.map((row) => {
    const { bucket, ...task } = row;
    void bucket;
    return task;
  });
}

export async function loadTaskBoardDataAction(): Promise<TaskBoardData> {
  await requireAdmin();
  const supabase = await createClient();
  const today = getTodayInBtmTimezone();

  const [groupsResult, activeTasksResult, doneTasksResult, doneCountsResult] =
    await Promise.all([
      supabase
        .from("task_groups")
        .select(TASK_GROUP_SELECT)
        .is("archived_at", null)
        .order("sort_order", { ascending: true }),
      supabase
        .from("tasks")
        .select(TASK_SELECT, { count: "exact" })
        .is("archived_at", null)
        .neq("status", "done")
        .order("group_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .range(0, MAX_ACTIVE_TASKS - 1),
      supabase.rpc("get_task_done_slice_by_group", {
        p_group_id: null,
        p_limit: DEFAULT_DONE_TASK_LIMIT,
        p_cursor_completed_at: null,
        p_cursor_id: null,
      }),
      supabase.rpc("get_task_done_counts_by_group"),
    ]);

  if (groupsResult.error) {
    throw new Error(`Failed to load task groups: ${groupsResult.error.message}`);
  }
  if (activeTasksResult.error) {
    throw new Error(`Failed to load active tasks: ${activeTasksResult.error.message}`);
  }
  if ((activeTasksResult.count ?? 0) > MAX_ACTIVE_TASKS) {
    throw new Error(
      `Task board has more than ${MAX_ACTIVE_TASKS} active tasks. Complete or archive older tasks before loading the board.`,
    );
  }
  if (doneTasksResult.error) {
    throw new Error(`Failed to load done tasks: ${doneTasksResult.error.message}`);
  }
  if (doneCountsResult.error) {
    throw new Error(`Failed to load done task counts: ${doneCountsResult.error.message}`);
  }

  const doneTasks = (doneTasksResult.data ?? []) as AdminTask[];
  const doneCountsByGroupId: Record<string, number> = {};
  for (const row of (doneCountsResult.data ?? []) as CountRow[]) {
    if (row.group_id) doneCountsByGroupId[row.group_id] = Number(row.done_count);
  }

  return {
    groups: (groupsResult.data ?? []) as TaskGroup[],
    activeTasks: (activeTasksResult.data ?? []) as AdminTask[],
    doneTasks,
    doneCountsByGroupId,
    doneCursorsByGroupId: buildGroupCursors(doneTasks),
    today,
  };
}

export async function loadMoreDoneTasksForGroupAction(
  groupId: string,
  cursor: TaskDoneCursor | null,
): Promise<{ tasks: AdminTask[]; cursor: TaskDoneCursor | null }> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_task_done_slice_by_group", {
    p_group_id: groupId,
    p_limit: DEFAULT_DONE_TASK_LIMIT,
    p_cursor_completed_at: cursor?.completedAt ?? null,
    p_cursor_id: cursor?.id ?? null,
  });

  if (error) throw new Error(`Failed to load more done tasks: ${error.message}`);
  const tasks = (data ?? []) as AdminTask[];
  return { tasks, cursor: cursorFromTask(tasks.at(-1)) };
}

export async function loadTaskDateViewDataAction(): Promise<TaskDateViewData> {
  await requireAdmin();
  const supabase = await createClient();
  const today = getTodayInBtmTimezone();

  const [activeTasksResult, doneTasksResult, doneCountsResult] =
    await Promise.all([
      supabase
        .from("tasks")
        .select(TASK_SELECT)
        .is("archived_at", null)
        .neq("status", "done")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("sort_order", { ascending: true }),
      supabase.rpc("get_task_done_slice_by_date_bucket", {
        p_bucket: null,
        p_today: today,
        p_limit: DEFAULT_DONE_TASK_LIMIT,
        p_cursor_completed_at: null,
        p_cursor_id: null,
      }),
      supabase.rpc("get_task_done_counts_by_date_bucket", {
        p_today: today,
      }),
    ]);

  if (activeTasksResult.error) {
    throw new Error(`Failed to load active tasks: ${activeTasksResult.error.message}`);
  }
  if (doneTasksResult.error) {
    throw new Error(`Failed to load done tasks by date: ${doneTasksResult.error.message}`);
  }
  if (doneCountsResult.error) {
    throw new Error(`Failed to load done task counts by date: ${doneCountsResult.error.message}`);
  }

  const doneRows = (doneTasksResult.data ?? []) as DateBucketTaskRow[];
  const doneCountsByDateBucket = emptyBucketRecord(0);
  for (const row of (doneCountsResult.data ?? []) as CountRow[]) {
    if (row.bucket && row.bucket in doneCountsByDateBucket) {
      doneCountsByDateBucket[row.bucket as TaskDateBucket] = Number(row.done_count);
    }
  }

  return {
    activeTasks: (activeTasksResult.data ?? []) as AdminTask[],
    doneTasks: mapDateBucketRows(doneRows),
    doneCountsByDateBucket,
    doneCursorsByDateBucket: buildBucketCursors(doneRows),
    today,
  };
}

export async function loadMoreDoneTasksForDateBucketAction(
  bucket: TaskDateBucket,
  cursor: TaskDoneCursor | null,
): Promise<{ tasks: AdminTask[]; cursor: TaskDoneCursor | null }> {
  await requireAdmin();
  const supabase = await createClient();
  const today = getTodayInBtmTimezone();
  const { data, error } = await supabase.rpc("get_task_done_slice_by_date_bucket", {
    p_bucket: bucket,
    p_today: today,
    p_limit: DEFAULT_DONE_TASK_LIMIT,
    p_cursor_completed_at: cursor?.completedAt ?? null,
    p_cursor_id: cursor?.id ?? null,
  });

  if (error) throw new Error(`Failed to load more done tasks by date: ${error.message}`);
  const rows = (data ?? []) as DateBucketTaskRow[];
  const tasks = mapDateBucketRows(rows);
  return { tasks, cursor: cursorFromTask(tasks.at(-1)) };
}

export async function loadTaskCommentsAction(taskId: string) {
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
