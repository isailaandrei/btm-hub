"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Archive, Check, LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  AdminTask,
  Profile,
  TaskGroup,
  TaskPriority,
  TaskStatus,
} from "@/types/database";
import {
  archiveTaskAction,
  moveTaskToGroupAction,
  updateTaskAction,
} from "./actions";
import {
  TASK_PRIORITY_META,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_META,
  TASK_STATUS_VALUES,
} from "./constants";
import { CreateTaskCommentForm } from "./task-forms";
import { useTaskData } from "./task-data-provider";

export function TaskDetailPanel({
  task,
  groups,
  tasks,
  admins,
  open,
  onOpenChange,
}: {
  task: AdminTask | null;
  groups: TaskGroup[];
  tasks: AdminTask[];
  admins: Profile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    commentsByTaskId,
    commentsError,
    ensureComments,
    reloadComments,
    refreshAfterMutation,
  } = useTaskData();
  const [pending, startTransition] = useTransition();

  const currentTask = useMemo(
    () => (task ? tasks.find((item) => item.id === task.id) ?? task : null),
    [task, tasks],
  );
  const comments = currentTask ? commentsByTaskId[currentTask.id] ?? [] : [];

  useEffect(() => {
    if (!open || !currentTask) return;
    void ensureComments(currentTask.id);
  }, [currentTask, ensureComments, open]);

  if (!currentTask) return null;
  const panelTask = currentTask;

  async function persistPatch(patch: Parameters<typeof updateTaskAction>[0]) {
    await updateTaskAction({ taskId: panelTask.id, ...patch });
    await refreshAfterMutation();
  }

  function showTaskUpdateError(error: unknown) {
    toast.error(error instanceof Error ? error.message : "Task update failed.");
  }

  function mutate(patch: Parameters<typeof updateTaskAction>[0]) {
    startTransition(async () => {
      try {
        await persistPatch(patch);
      } catch (error) {
        showTaskUpdateError(error);
      }
    });
  }

  function moveToGroup(groupId: string) {
    if (panelTask.status === "done" || groupId === panelTask.group_id) return;
    const targetTaskIds = tasks
      .filter(
        (item) =>
          item.group_id === groupId &&
          item.status !== "done" &&
          !item.archived_at &&
          item.id !== panelTask.id,
      )
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((item) => item.id)
      .concat(panelTask.id);

    startTransition(() => {
      void moveTaskToGroupAction(panelTask.id, groupId, targetTaskIds)
        .then(refreshAfterMutation)
        .catch((error) => toast.error(error instanceof Error ? error.message : "Task move failed."));
    });
  }

  function archiveTask() {
    if (!window.confirm(`Archive "${panelTask.title}"?`)) return;
    startTransition(() => {
      void archiveTaskAction(panelTask.id)
        .then(async () => {
          onOpenChange(false);
          await refreshAfterMutation();
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Task archive failed."));
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Task details</SheetTitle>
          <SheetDescription>
            Comments are append-only. Done tasks must be reopened before moving groups.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          <TaskTitleEditor
            key={`title-${panelTask.id}`}
            title={panelTask.title}
            onSave={async (title) => {
              try {
                await persistPatch({ title });
              } catch (error) {
                showTaskUpdateError(error);
                throw error;
              }
            }}
          />

          <TaskNotesEditor
            key={`notes-${panelTask.id}`}
            notes={panelTask.description}
            onSave={async (notes) => {
              try {
                await persistPatch({ description: notes });
              } catch (error) {
                showTaskUpdateError(error);
                throw error;
              }
            }}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Group</span>
              <select
                value={currentTask.group_id}
                disabled={currentTask.status === "done" || pending}
                onChange={(event) => moveToGroup(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Assignee</span>
              <select
                value={currentTask.assignee_id ?? ""}
                onChange={(event) => mutate({ assigneeId: event.target.value || null })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Unassigned</option>
                {admins.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.display_name ?? profile.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Due date</span>
              <input
                type="date"
                value={currentTask.due_date ?? ""}
                onChange={(event) => mutate({ dueDate: event.target.value || null })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Status</span>
              <select
                value={currentTask.status}
                onChange={(event) => mutate({ status: event.target.value as TaskStatus })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {TASK_STATUS_VALUES.map((status) => (
                  <option key={status} value={status}>
                    {TASK_STATUS_META[status].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Priority</span>
              <select
                value={currentTask.priority}
                onChange={(event) => mutate({ priority: event.target.value as TaskPriority })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {TASK_PRIORITY_VALUES.map((priority) => (
                  <option key={priority} value={priority}>
                    {TASK_PRIORITY_META[priority].label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-md border border-border">
            <div className="border-b border-border px-3 py-2 text-sm font-medium">
              Comments
            </div>
            {commentsError && (
              <div className="px-3 py-2 text-sm text-destructive">{commentsError}</div>
            )}
            <div className="max-h-56 space-y-3 overflow-y-auto p-3">
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="rounded-md bg-muted/50 p-3">
                    <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                      <span>{comment.author_name}</span>
                      <span>{new Date(comment.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-border p-3">
              <CreateTaskCommentForm
                taskId={currentTask.id}
                onSuccess={() => {
                  void reloadComments(currentTask.id);
                  void refreshAfterMutation();
                }}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="destructive" onClick={archiveTask}>
              <Archive />
              Archive task
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TaskTitleEditor({
  title,
  onSave,
}: {
  title: string;
  onSave: (title: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(title);
  const [savedTitle, setSavedTitle] = useState(title);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const normalizedDraft = draft.trim();
  const changed = normalizedDraft !== savedTitle;
  const invalid = normalizedDraft.length === 0;
  const isSaving = saveState === "saving";
  const isSaved = saveState === "saved" && !changed;
  const helperMessage =
    invalid && changed
      ? "Title is required."
      : saveState === "saving"
        ? "Saving title..."
        : isSaved
          ? "Title saved."
          : saveState === "error"
            ? "Title was not saved."
            : changed
              ? "Unsaved title changes."
              : "";

  async function handleSave() {
    if (!changed || invalid || isSaving) return;
    setSaveState("saving");
    try {
      await onSave(normalizedDraft);
      setSavedTitle(normalizedDraft);
      setDraft(normalizedDraft);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">Title</span>
      <input
        aria-label="Task title"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (saveState !== "idle") setSaveState("idle");
        }}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="flex items-center justify-between gap-3">
        <p
          aria-live="polite"
          className={cn(
            "min-h-4 text-xs",
            invalid && changed
              ? "text-destructive"
              : saveState === "error"
                ? "text-destructive"
                : isSaved
                  ? "text-green-700"
                  : "text-muted-foreground",
          )}
        >
          {helperMessage}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void handleSave()}
          disabled={!changed || invalid || isSaving}
          aria-disabled={!changed || invalid || isSaving}
          className={cn(
            "min-w-36",
            isSaving &&
              "cursor-progress border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50",
            isSaved &&
              "border-green-200 bg-green-50 text-green-700 hover:bg-green-50 disabled:opacity-100",
          )}
        >
          {isSaving ? (
            <LoaderCircle className="animate-spin" />
          ) : isSaved ? (
            <Check />
          ) : (
            <Save />
          )}
          {isSaving ? "Saving..." : isSaved ? "Saved" : "Save title"}
        </Button>
      </div>
    </label>
  );
}

function TaskNotesEditor({
  notes,
  onSave,
}: {
  notes: string;
  onSave: (notes: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(notes);
  const [savedNotes, setSavedNotes] = useState(notes);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const changed = draft !== savedNotes;
  const isSaving = saveState === "saving";
  const isSaved = saveState === "saved" && !changed;
  const helperMessage =
    saveState === "saving"
      ? "Saving notes..."
      : isSaved
        ? "Notes saved."
        : saveState === "error"
          ? "Notes were not saved."
          : changed
            ? "Unsaved changes."
            : "";

  async function handleSave() {
    if (!changed || isSaving) return;
    setSaveState("saving");
    try {
      await onSave(draft);
      setSavedNotes(draft);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">Notes</span>
      <textarea
        aria-label="Task notes"
        value={draft}
        rows={5}
        onChange={(event) => {
          setDraft(event.target.value);
          if (saveState !== "idle") setSaveState("idle");
        }}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="flex items-center justify-between gap-3">
        <p
          aria-live="polite"
          className={cn(
            "min-h-4 text-xs",
            saveState === "error"
              ? "text-destructive"
              : isSaved
                ? "text-green-700"
                : "text-muted-foreground",
          )}
        >
          {helperMessage}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void handleSave()}
          disabled={!changed && !isSaving}
          aria-disabled={isSaving || (!changed && !isSaving)}
          className={cn(
            "min-w-36",
            isSaving &&
              "cursor-progress border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50",
            isSaved &&
              "border-green-200 bg-green-50 text-green-700 hover:bg-green-50 disabled:opacity-100",
          )}
        >
          {isSaving ? (
            <LoaderCircle className="animate-spin" />
          ) : isSaved ? (
            <Check />
          ) : (
            <Save />
          )}
          {isSaving ? "Saving..." : isSaved ? "Saved" : "Save notes"}
        </Button>
      </div>
    </label>
  );
}
