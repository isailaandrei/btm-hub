"use server";

import { z } from "zod/v4";
import { isUUID, validateUUID } from "@/lib/validation-helpers";
import {
  archiveTask,
  archiveTaskGroup,
  createTask,
  createTaskComment,
  createTaskGroup,
  moveTaskToGroup,
  reorderTaskGroups,
  reorderTasks,
  updateTask,
  updateTaskGroup,
} from "@/lib/data/tasks";
import {
  TASK_GROUP_COLORS,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
} from "./constants";
import type {
  TaskGroupColor,
} from "@/types/database";

export type TaskFormState = {
  errors?: Record<string, string[]>;
  message?: string;
  success?: boolean;
  taskId?: string;
  groupId?: string;
  resetKey?: number;
};

const uuidSchema = z.string().refine(isUUID, "Invalid ID");
const nullableUuidSchema = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value === "" ? null : value))
  .refine((value) => value === null || isUUID(value), "Invalid ID");

const dueDateSchema = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value === "" ? null : value))
  .refine(
    (value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Use YYYY-MM-DD",
  );

const taskGroupSchema = z.object({
  name: z.string().trim().min(1, "Group name is required").max(80),
  color: z.enum(TASK_GROUP_COLORS),
});

const createTaskSchema = z.object({
  groupId: uuidSchema,
  title: z.string().trim().min(1, "Task title is required").max(180),
  description: z.string().max(5000).default(""),
  assigneeId: nullableUuidSchema,
  dueDate: dueDateSchema,
  status: z.enum(TASK_STATUS_VALUES),
  priority: z.enum(TASK_PRIORITY_VALUES),
});

const taskPatchSchema = z
  .object({
    taskId: uuidSchema,
    title: z.string().trim().min(1).max(180).optional(),
    description: z.string().max(5000).optional(),
    assigneeId: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    status: z.enum(TASK_STATUS_VALUES).optional(),
    priority: z.enum(TASK_PRIORITY_VALUES).optional(),
  })
  .strict();

const commentSchema = z.object({
  taskId: uuidSchema,
  body: z.string().trim().min(1, "Comment is required").max(3000),
});

function formValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function nextResetKey(prevState: TaskFormState) {
  return (prevState.resetKey ?? 0) + 1;
}

function failure(error: unknown, prevState?: TaskFormState): TaskFormState {
  return {
    message:
      error instanceof Error
        ? error.message
        : "The task update failed. Please try again.",
    success: false,
    resetKey: prevState?.resetKey ?? 0,
  };
}

function validationFailure(error: z.ZodError, prevState?: TaskFormState): TaskFormState {
  return {
    errors: error.flatten().fieldErrors,
    success: false,
    resetKey: prevState?.resetKey ?? 0,
  };
}

export async function createTaskGroupAction(
  prevState: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const parsed = taskGroupSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || "blue",
  });
  if (!parsed.success) return validationFailure(parsed.error, prevState);

  try {
    const group = await createTaskGroup(parsed.data);
    return {
      message: "Task group created.",
      success: true,
      groupId: group.id,
      resetKey: nextResetKey(prevState),
    };
  } catch (error) {
    return failure(error, prevState);
  }
}

export async function updateTaskGroupAction(input: {
  groupId: string;
  name?: string;
  color?: TaskGroupColor;
}) {
  validateUUID(input.groupId, "task group");
  const parsed = taskGroupSchema.partial().safeParse({
    name: input.name,
    color: input.color,
  });
  if (!parsed.success) throw new Error("Invalid task group update");
  const group = await updateTaskGroup(input.groupId, parsed.data);
  return group;
}

export async function archiveTaskGroupAction(groupId: string) {
  validateUUID(groupId, "task group");
  await archiveTaskGroup(groupId);
}

export async function createTaskAction(
  prevState: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const parsed = createTaskSchema.safeParse({
    groupId: formValue(formData, "groupId"),
    title: formValue(formData, "title"),
    description: formValue(formData, "description"),
    assigneeId: formValue(formData, "assigneeId"),
    dueDate: formValue(formData, "dueDate"),
    status: formValue(formData, "status") || "not_started",
    priority: formValue(formData, "priority") || "normal",
  });
  if (!parsed.success) return validationFailure(parsed.error, prevState);

  try {
    const task = await createTask(parsed.data);
    return {
      message: "Task created.",
      success: true,
      taskId: task.id,
      resetKey: nextResetKey(prevState),
    };
  } catch (error) {
    return failure(error, prevState);
  }
}

export async function updateTaskAction(input: Record<string, unknown>) {
  if ("group_id" in input || "groupId" in input) {
    throw new Error("Use moveTaskToGroupAction to change a task group");
  }

  const parsed = taskPatchSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid task update");

  const { taskId, ...patch } = parsed.data;
  if (patch.assigneeId !== undefined && patch.assigneeId !== null) {
    validateUUID(patch.assigneeId, "assignee");
  }
  if (
    patch.dueDate !== undefined &&
    patch.dueDate !== null &&
    !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate)
  ) {
    throw new Error("Invalid due date");
  }

  const task = await updateTask(taskId, patch);
  return task;
}

export async function archiveTaskAction(taskId: string) {
  validateUUID(taskId, "task");
  await archiveTask(taskId);
}

export async function createTaskCommentAction(
  prevState: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const parsed = commentSchema.safeParse({
    taskId: formValue(formData, "taskId"),
    body: formValue(formData, "body"),
  });
  if (!parsed.success) return validationFailure(parsed.error, prevState);

  try {
    await createTaskComment(parsed.data);
    return {
      message: "Comment added.",
      success: true,
      taskId: parsed.data.taskId,
      resetKey: nextResetKey(prevState),
    };
  } catch (error) {
    return failure(error, prevState);
  }
}

export async function reorderTaskGroupsAction(groupIds: string[]) {
  for (const id of groupIds) validateUUID(id, "task group");
  await reorderTaskGroups(groupIds);
}

export async function reorderTasksAction(groupId: string, taskIds: string[]) {
  validateUUID(groupId, "task group");
  for (const id of taskIds) validateUUID(id, "task");
  await reorderTasks(groupId, taskIds);
}

export async function moveTaskToGroupAction(
  taskId: string,
  targetGroupId: string,
  targetTaskIds: string[],
) {
  validateUUID(taskId, "task");
  validateUUID(targetGroupId, "task group");
  for (const id of targetTaskIds) validateUUID(id, "task");
  await moveTaskToGroup({ taskId, targetGroupId, targetTaskIds });
}
