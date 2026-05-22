"use client";

import { useActionState, useEffect, useRef } from "react";
import { Send, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Profile, TaskGroup } from "@/types/database";
import {
  createTaskAction,
  createTaskCommentAction,
  createTaskGroupAction,
  type TaskFormState,
} from "./actions";
import {
  TASK_PRIORITY_META,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_META,
  TASK_STATUS_VALUES,
} from "./constants";

const INITIAL_STATE: TaskFormState = { success: false, resetKey: 0 };

function FieldError({
  errors,
  reserveSpace = false,
}: {
  errors?: string[];
  reserveSpace?: boolean;
}) {
  const message = errors?.[0] ?? "";
  if (!message && !reserveSpace) return null;
  return (
    <p
      data-task-form-helper={reserveSpace ? "" : undefined}
      className={`text-xs text-destructive ${reserveSpace ? "min-h-4" : ""}`}
      aria-live="polite"
    >
      {message}
    </p>
  );
}

export function CreateTaskGroupForm({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    createTaskGroupAction,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    onSuccess();
  }, [onSuccess, state.resetKey, state.success]);

  return (
    <form
      ref={formRef}
      action={action}
      className="grid gap-2 sm:grid-cols-[minmax(12rem,20rem)_max-content] sm:items-start sm:justify-start"
    >
      <label className="grid grid-rows-[1rem_2.25rem_1rem] gap-1 text-xs font-medium text-muted-foreground">
        Group
        <input
          name="name"
          placeholder="New group"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        />
        <FieldError errors={state.errors?.name} reserveSpace />
      </label>
      <Button
        type="submit"
        size="sm"
        className="justify-self-start self-start sm:mt-5"
        disabled={pending}
      >
        <Plus />
        Group
      </Button>
      {state.message && !state.success && (
        <p className="basis-full text-xs text-destructive">{state.message}</p>
      )}
    </form>
  );
}

export function CreateTaskForm({
  group,
  admins,
  onSuccess,
}: {
  group: TaskGroup;
  admins: Profile[];
  onSuccess: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(createTaskAction, INITIAL_STATE);
  const showCreatingRow = pending;

  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    onSuccess();
  }, [onSuccess, state.resetKey, state.success]);

  return (
    <>
      {showCreatingRow && (
        <div
          className="border-t border-border bg-muted/10 px-3 py-4 text-sm text-muted-foreground"
          aria-live="polite"
        >
          Creating task...
        </div>
      )}
      <form
        ref={formRef}
        action={action}
        className={`grid gap-2 border-t border-border bg-muted/10 p-3 md:grid-cols-[minmax(220px,1fr)_150px_130px_120px_minmax(180px,0.8fr)_auto] md:items-start ${showCreatingRow ? "hidden" : ""}`}
      >
        <input type="hidden" name="groupId" value={group.id} />
        <label className="grid min-w-0 grid-rows-[1rem_2.25rem_1rem] gap-1 text-xs font-medium text-muted-foreground">
          Task
          <input
            name="title"
            placeholder={`New task in ${group.name}`}
            className="h-9 min-w-0 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
          <FieldError errors={state.errors?.title} reserveSpace />
        </label>
        <label className="grid min-w-0 grid-rows-[1rem_2.25rem_1rem] gap-1 text-xs font-medium text-muted-foreground">
          Assignee
          <select
            name="assigneeId"
            className="h-9 min-w-0 w-full max-w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="">Unassigned</option>
            {admins.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.display_name ?? profile.email}
              </option>
            ))}
          </select>
          <FieldError reserveSpace />
        </label>
        <label className="grid min-w-0 grid-rows-[1rem_2.25rem_1rem] gap-1 text-xs font-medium text-muted-foreground">
          Due
          <input
            name="dueDate"
            type="date"
            className="h-9 min-w-0 w-full max-w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
          />
          <FieldError reserveSpace />
        </label>
        <label className="grid min-w-0 grid-rows-[1rem_2.25rem_1rem] gap-1 text-xs font-medium text-muted-foreground">
          Priority
          <select
            name="priority"
            defaultValue="normal"
            className="h-9 min-w-0 w-full max-w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            {TASK_PRIORITY_VALUES.map((priority) => (
              <option key={priority} value={priority}>
                {TASK_PRIORITY_META[priority].label}
              </option>
            ))}
          </select>
          <FieldError reserveSpace />
        </label>
        <label className="grid min-w-0 grid-rows-[1rem_2.25rem_1rem] gap-1 text-xs font-medium text-muted-foreground">
          Notes
          <input
            name="description"
            placeholder="Add notes"
            className="h-9 min-w-0 w-full max-w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
          />
          <FieldError reserveSpace />
        </label>
        <input type="hidden" name="status" value="not_started" />
        <Button type="submit" size="sm" className="self-start md:mt-5" disabled={pending}>
          <Plus />
          Task
        </Button>
        {state.message && !state.success && (
          <p className="md:col-span-6 text-xs text-destructive">{state.message}</p>
        )}
      </form>
    </>
  );
}

export function CreateTaskCommentForm({
  taskId,
  onSuccess,
}: {
  taskId: string;
  onSuccess: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    createTaskCommentAction,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    onSuccess();
  }, [onSuccess, state.resetKey, state.success]);

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="taskId" value={taskId} />
      <textarea
        name="body"
        rows={3}
        placeholder="Add a comment"
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
      />
      <FieldError errors={state.errors?.body} />
      <div className="flex items-center justify-between">
        {state.message && !state.success ? (
          <p className="text-xs text-destructive">{state.message}</p>
        ) : (
          <span />
        )}
        <Button type="submit" size="sm" disabled={pending}>
          <Send />
          Comment
        </Button>
      </div>
    </form>
  );
}

export function statusOptions() {
  return TASK_STATUS_VALUES.map((status) => ({
    value: status,
    label: TASK_STATUS_META[status].label,
  }));
}
