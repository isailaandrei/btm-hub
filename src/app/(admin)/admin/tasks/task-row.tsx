"use client";

import { useTransition, type ReactNode } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  AdminAssigneeProfile,
  AdminTask,
  TaskPriority,
  TaskStatus,
} from "@/types/database";
import { deleteTaskAction, updateTaskAction } from "./actions";
import {
  TASK_PRIORITY_META,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_META,
  TASK_STATUS_VALUES,
} from "./constants";
import {
  buildOptimisticTaskPatch,
  type OptimisticTaskPatch,
  type TaskUpdatePatch,
} from "./task-data-provider";

function displayProfile(
  profile: AdminAssigneeProfile | undefined,
  fallback = "Unassigned",
) {
  if (!profile) return fallback;
  return profile.display_name ?? profile.email;
}

export function TaskRow({
  task,
  admins,
  onOpen,
  onRefresh,
  onOptimisticUpdate,
  onOptimisticRemove,
  dragHandle,
  compact = false,
}: {
  task: AdminTask;
  admins: AdminAssigneeProfile[];
  onOpen: (task: AdminTask) => void;
  onRefresh: () => Promise<void>;
  onOptimisticUpdate?: (taskId: string, patch: OptimisticTaskPatch) => void;
  onOptimisticRemove?: (taskId: string) => void;
  dragHandle?: ReactNode;
  compact?: boolean;
}) {
  const [, startTransition] = useTransition();

  function mutate(patch: TaskUpdatePatch) {
    onOptimisticUpdate?.(task.id, buildOptimisticTaskPatch(task, patch));
    startTransition(() => {
      void updateTaskAction({ taskId: task.id, ...patch })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : "Task update failed.");
          void onRefresh();
        });
    });
  }

  function deleteTask() {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    onOptimisticRemove?.(task.id);
    startTransition(() => {
      void deleteTaskAction(task.id)
        .then(() => {
          void onRefresh();
        })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : "Task delete failed.");
          void onRefresh();
        });
    });
  }

  return (
    <div
      data-task-row-id={task.id}
      data-task-row-title={task.title}
      data-task-row-status={task.status}
      className={cn(
        "grid min-h-11 items-center border-b border-border text-sm",
        compact
          ? "grid-cols-[minmax(220px,1fr)_110px_110px]"
          : "grid-cols-[36px_minmax(260px,1.35fr)_150px_150px_130px_120px_minmax(180px,0.8fr)_44px]",
      )}
    >
      {!compact && (
        <div className="flex justify-center text-muted-foreground">{dragHandle}</div>
      )}
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="flex h-full items-center truncate border-r border-border px-3 text-left font-medium text-foreground hover:bg-muted/30 hover:underline"
      >
        {task.title}
      </button>
      {!compact && (
        <>
          <div className="flex h-full items-center border-r border-border px-2">
            <select
              value={task.assignee_id ?? ""}
              onChange={(event) =>
                mutate({ assigneeId: event.target.value || null })
              }
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">Unassigned</option>
              {admins.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {displayProfile(profile)}
                </option>
              ))}
            </select>
          </div>
          <div
            className={cn(
              "relative h-full border-r border-border",
              TASK_STATUS_META[task.status].className,
            )}
          >
            <select
              value={task.status}
              onChange={(event) =>
                mutate({ status: event.target.value as TaskStatus })
              }
              className="h-full w-full appearance-none rounded-none border-0 bg-transparent pl-2 pr-9 text-center text-sm font-medium outline-none"
            >
              {TASK_STATUS_VALUES.map((status) => (
                <option key={status} value={status}>
                  {TASK_STATUS_META[status].label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-80" />
          </div>
          <div className="flex h-full items-center border-r border-border px-2">
            <input
              type="date"
              value={task.due_date ?? ""}
              onChange={(event) => mutate({ dueDate: event.target.value || null })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            />
          </div>
          <div
            className={cn(
              "relative h-full border-r border-border",
              TASK_PRIORITY_META[task.priority].className,
            )}
          >
            <select
              value={task.priority}
              onChange={(event) =>
                mutate({ priority: event.target.value as TaskPriority })
              }
              className="h-full w-full appearance-none rounded-none border-0 bg-transparent pl-2 pr-9 text-center text-sm font-medium outline-none"
            >
              {TASK_PRIORITY_VALUES.map((priority) => (
                <option key={priority} value={priority}>
                  {TASK_PRIORITY_META[priority].label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-80" />
          </div>
          <div className="flex h-full items-center px-2">
            <input
              defaultValue={task.description}
              onBlur={(event) => {
                if (event.target.value !== task.description) {
                  mutate({ description: event.target.value });
                }
              }}
              placeholder="Add notes"
              className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-xs outline-none hover:border-input focus:border-ring focus:bg-background"
              aria-label="Task notes"
            />
          </div>
          <div className="flex h-full items-center justify-center border-l border-border">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={deleteTask}
              aria-label={`Delete task ${task.title}`}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 />
            </Button>
          </div>
        </>
      )}
      {compact && (
        <>
          <Badge className={TASK_STATUS_META[task.status].className}>
            {TASK_STATUS_META[task.status].label}
          </Badge>
          <span className="truncate text-xs text-muted-foreground">
            {task.due_date ?? "No date"}
          </span>
        </>
      )}
    </div>
  );
}
