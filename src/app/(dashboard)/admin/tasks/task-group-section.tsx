"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { flushSync } from "react-dom";
import { Archive, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AdminTask, Profile, TaskGroup } from "@/types/database";
import { archiveTaskGroupAction, reorderTasksAction, updateTaskGroupAction } from "./actions";
import {
  DEFAULT_DONE_TASK_LIMIT,
  TASK_GROUP_COLORS,
  TASK_GROUP_COLOR_META,
} from "./constants";
import { CreateTaskForm } from "./task-forms";
import { SortableItem, SortableList } from "./task-dnd";
import { getPendingOptimisticIds, orderTasksByIds } from "./task-board-view-model";
import { TaskRow } from "./task-row";

export function TaskGroupSection({
  group,
  activeTasks,
  visibleDoneTasks,
  hiddenDoneCount,
  doneCount,
  admins,
  isFiltered,
  onOpenTask,
  onRefresh,
  onShowMoreDone,
  groupDragHandle,
  isAdding,
  onAddingChange,
}: {
  group: TaskGroup;
  activeTasks: AdminTask[];
  visibleDoneTasks: AdminTask[];
  hiddenDoneCount: number;
  doneCount: number;
  admins: Profile[];
  isFiltered: boolean;
  onOpenTask: (task: AdminTask) => void;
  onRefresh: () => Promise<void>;
  onShowMoreDone: (groupId: string) => Promise<void>;
  groupDragHandle?: ReactNode;
  isAdding: boolean;
  onAddingChange: (adding: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [optimisticTaskIds, setOptimisticTaskIds] = useState<string[] | null>(null);
  const [taskReorderPending, setTaskReorderPending] = useState(false);
  const [pending, startTransition] = useTransition();
  const pendingOptimisticTaskIds = useMemo(
    () => getPendingOptimisticIds(activeTasks, optimisticTaskIds),
    [activeTasks, optimisticTaskIds],
  );
  const orderedActiveTasks = useMemo(
    () => orderTasksByIds(activeTasks, pendingOptimisticTaskIds),
    [activeTasks, pendingOptimisticTaskIds],
  );

  function rename(nextName: string) {
    const name = nextName.trim();
    if (!name || name === group.name) return;
    startTransition(() => {
      void updateTaskGroupAction({ groupId: group.id, name })
        .then(onRefresh)
        .catch((error) => toast.error(error instanceof Error ? error.message : "Group update failed."));
    });
  }

  function recolor(color: string) {
    if (color === group.color) return;
    startTransition(() => {
      void updateTaskGroupAction({
        groupId: group.id,
        color: color as TaskGroup["color"],
      })
        .then(onRefresh)
        .catch((error) => toast.error(error instanceof Error ? error.message : "Group update failed."));
    });
  }

  function archiveGroup() {
    if (
      !window.confirm(
        `Archive "${group.name}" and all contained tasks? This hides the group from normal task views.`,
      )
    ) {
      return;
    }
    startTransition(() => {
      void archiveTaskGroupAction(group.id)
        .then(onRefresh)
        .catch((error) => toast.error(error instanceof Error ? error.message : "Group archive failed."));
    });
  }

  async function handleTaskDragEnd(activeId: string, overId: string) {
    if (activeId === overId) return;
    const oldIndex = orderedActiveTasks.findIndex((task) => task.id === activeId);
    const newIndex = orderedActiveTasks.findIndex((task) => task.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;
    const orderedIds = arrayMove(orderedActiveTasks, oldIndex, newIndex).map((task) => task.id);
    flushSync(() => {
      setOptimisticTaskIds(orderedIds);
      setTaskReorderPending(true);
    });
    try {
      await reorderTasksAction(group.id, orderedIds);
      await onRefresh();
    } catch (error) {
      setOptimisticTaskIds(null);
      toast.error(error instanceof Error ? error.message : "Task reorder failed.");
      await onRefresh();
    } finally {
      setTaskReorderPending(false);
    }
  }

  const visibleTaskCount = orderedActiveTasks.length + visibleDoneTasks.length;
  const taskDragDisabled = isFiltered || taskReorderPending || Boolean(pendingOptimisticTaskIds);

  return (
    <section
      data-task-group-id={group.id}
      data-task-group-name={group.name}
      className="overflow-x-auto overflow-y-hidden rounded-md border border-border bg-card shadow-sm"
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 border-l-4 border-b border-border bg-background px-3 py-3",
          TASK_GROUP_COLOR_META[group.color].borderClassName,
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={collapsed ? "Expand group" : "Collapse group"}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {groupDragHandle}
        <span
          aria-hidden="true"
          className={cn(
            "size-3 rounded-full",
            TASK_GROUP_COLOR_META[group.color].markerClassName,
          )}
        />
        <input
          defaultValue={group.name}
          onBlur={(event) => rename(event.target.value)}
          className={cn(
            "min-w-[10rem] flex-1 bg-transparent text-lg font-semibold outline-none",
            TASK_GROUP_COLOR_META[group.color].textClassName,
          )}
          aria-label="Group name"
        />
        <span className="text-xs text-muted-foreground">
          {visibleTaskCount} visible, {doneCount} done
        </span>
        {isFiltered && (
          <span className="hidden text-xs text-muted-foreground md:inline">
            Clear filters to reorder
          </span>
        )}
        <select
          value={group.color}
          onChange={(event) => recolor(event.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          disabled={pending}
          aria-label="Group color"
        >
          {TASK_GROUP_COLORS.map((color) => (
            <option key={color} value={color}>
              {TASK_GROUP_COLOR_META[color].label}
            </option>
          ))}
        </select>
        <Button type="button" size="icon-sm" variant="destructive" onClick={archiveGroup} aria-label="Archive group">
          <Archive />
        </Button>
      </div>

      {!collapsed && (
        <>
          <div className="hidden grid-cols-[36px_minmax(260px,1.35fr)_150px_150px_130px_120px_minmax(180px,0.8fr)] border-b border-border bg-muted/20 px-0 py-0 text-sm font-medium text-muted-foreground md:grid">
            <span />
            <span className="border-r border-border px-3 py-3 text-center">Task</span>
            <span className="border-r border-border px-2 py-3 text-center">Owner</span>
            <span className="border-r border-border px-2 py-3 text-center">Status</span>
            <span className="border-r border-border px-2 py-3 text-center">Due date</span>
            <span className="border-r border-border px-2 py-3 text-center">Priority</span>
            <span className="px-2 py-3 text-center">Notes</span>
          </div>
          <SortableList
            ids={orderedActiveTasks.map((task) => task.id)}
            disabled={isFiltered}
            onDragEnd={({ active, over }) => {
              if (over) void handleTaskDragEnd(String(active.id), String(over.id));
            }}
          >
            {orderedActiveTasks.map((task) => (
              <SortableItem
                key={task.id}
                id={task.id}
                disabled={isFiltered}
                handleDisabled={taskDragDisabled}
              >
                {(handle) => (
                  <TaskRow
                    task={task}
                    admins={admins}
                    onOpen={onOpenTask}
                    onRefresh={onRefresh}
                    dragHandle={handle}
                  />
                )}
              </SortableItem>
            ))}
          </SortableList>
          {visibleDoneTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              admins={admins}
              onOpen={onOpenTask}
              onRefresh={onRefresh}
              dragHandle={null}
            />
          ))}
          <div className="grid min-h-11 grid-cols-[36px_minmax(260px,1.35fr)_150px_150px_130px_120px_minmax(180px,0.8fr)] items-center border-b border-border bg-muted/5 text-sm">
            <div className="flex h-full items-center justify-center border-r border-border">
              <input
                type="checkbox"
                aria-label="Add task row"
                disabled
                className="size-4 rounded border-border"
              />
            </div>
            <button
              type="button"
              onClick={() => onAddingChange(true)}
              disabled={isAdding}
              className="flex h-full items-center border-r border-border px-3 text-left text-muted-foreground hover:bg-muted/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              + Add task
            </button>
            <span className="h-full border-r border-border" />
            <span className="h-full border-r border-border" />
            <span className="h-full border-r border-border" />
            <span className="h-full border-r border-border" />
            <span className="h-full" />
          </div>
          {hiddenDoneCount > 0 && (
            <div className="border-b border-border px-3 py-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void onShowMoreDone(group.id)}
              >
                Show {Math.min(hiddenDoneCount, DEFAULT_DONE_TASK_LIMIT)} more done tasks
              </Button>
            </div>
          )}
          {isAdding && (
            <CreateTaskForm
              group={group}
              admins={admins}
              onSuccess={() => {
                onAddingChange(false);
                void onRefresh();
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
