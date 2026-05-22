"use client";

import { useMemo, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { flushSync } from "react-dom";
import { CalendarDays, EyeOff, Search, UserCircle } from "lucide-react";
import { toast } from "sonner";
import type { AdminTask, Profile } from "@/types/database";
import { reorderTaskGroupsAction } from "./actions";
import { DEFAULT_DONE_TASK_LIMIT } from "./constants";
import { SortableItem, SortableList } from "./task-dnd";
import { TaskGroupSection } from "./task-group-section";
import {
  buildTaskBoardViewModel,
  getPendingOptimisticIds,
  orderTaskGroupsByIds,
  type TaskBoardFilters,
  type TaskDueFilter,
} from "./task-board-view-model";
import type {
  OptimisticGroupPatch,
  OptimisticTaskPatch,
} from "./task-data-provider";

export function TaskBoardView({
  groups,
  tasks,
  today,
  doneCountsByGroupId,
  admins,
  onOpenTask,
  onRefresh,
  onShowMoreDone,
  onOptimisticGroupUpdate,
  onOptimisticTaskUpdate,
}: {
  groups: Parameters<typeof buildTaskBoardViewModel>[0]["groups"];
  tasks: AdminTask[];
  today: string;
  doneCountsByGroupId: Record<string, number>;
  admins: Profile[];
  onOpenTask: (task: AdminTask) => void;
  onRefresh: () => Promise<void>;
  onShowMoreDone: (groupId: string) => Promise<void>;
  onOptimisticGroupUpdate?: (groupId: string, patch: OptimisticGroupPatch) => void;
  onOptimisticTaskUpdate?: (taskId: string, patch: OptimisticTaskPatch) => void;
}) {
  const [expandedDoneGroupIds, setExpandedDoneGroupIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [due, setDue] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const [optimisticGroupIds, setOptimisticGroupIds] = useState<string[] | null>(null);
  const [groupReorderPending, setGroupReorderPending] = useState(false);
  const [addingGroupIds, setAddingGroupIds] = useState<Set<string>>(new Set());
  const groupDragStartIdsRef = useRef<string[] | null>(null);

  const filters: TaskBoardFilters = useMemo(
    () => ({
      search,
      assigneeId: assigneeId || undefined,
      due: (due || undefined) as TaskDueFilter | undefined,
      today,
    }),
    [assigneeId, due, search, today],
  );

  const persistedGroupOrder = useMemo(
    () => orderTaskGroupsByIds(groups, null),
    [groups],
  );
  const pendingOptimisticGroupIds = useMemo(
    () => getPendingOptimisticIds(persistedGroupOrder, optimisticGroupIds),
    [optimisticGroupIds, persistedGroupOrder],
  );
  const orderedGroups = useMemo(
    () => orderTaskGroupsByIds(groups, pendingOptimisticGroupIds),
    [groups, pendingOptimisticGroupIds],
  );

  const viewModel = useMemo(
    () =>
      buildTaskBoardViewModel({
        groups: orderedGroups,
        tasks,
        hideDone,
        expandedDoneGroupIds,
        doneLimit: DEFAULT_DONE_TASK_LIMIT,
        filters,
      }),
    [expandedDoneGroupIds, filters, hideDone, orderedGroups, tasks],
  );

  function draggedGroupIds(activeId: string, overId: string) {
    const dragStartIds =
      groupDragStartIdsRef.current ?? viewModel.groups.map((item) => item.group.id);
    const oldIndex = dragStartIds.indexOf(activeId);
    const newIndex = dragStartIds.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return null;
    return arrayMove(dragStartIds, oldIndex, newIndex);
  }

  function handleGroupDragStart() {
    groupDragStartIdsRef.current = viewModel.groups.map((item) => item.group.id);
  }

  function handleGroupDragCancel() {
    groupDragStartIdsRef.current = null;
    setOptimisticGroupIds(null);
  }

  async function handleGroupDragEnd(activeId: string, overId: string) {
    const orderedIds = activeId === overId ? null : draggedGroupIds(activeId, overId);
    groupDragStartIdsRef.current = null;
    if (!orderedIds) {
      setOptimisticGroupIds(null);
      return;
    }
    flushSync(() => {
      setOptimisticGroupIds(orderedIds);
      setGroupReorderPending(true);
    });
    try {
      await reorderTaskGroupsAction(orderedIds);
      await onRefresh();
    } catch (error) {
      setOptimisticGroupIds(null);
      toast.error(error instanceof Error ? error.message : "Group reorder failed.");
      await onRefresh();
    } finally {
      setGroupReorderPending(false);
    }
  }

  async function showMoreDone(groupId: string) {
    try {
      await onShowMoreDone(groupId);
      setExpandedDoneGroupIds((prev) => new Set(prev).add(groupId));
    } catch {
      // The data provider surfaces the load failure and keeps the board unexpanded.
    }
  }

  function setGroupAdding(groupId: string, adding: boolean) {
    setAddingGroupIds((prev) => {
      const next = new Set(prev);
      if (adding) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  }

  const groupDragDisabled =
    viewModel.isFiltered || groupReorderPending || Boolean(pendingOptimisticGroupIds);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <label className="relative h-9 w-64 max-w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:border-ring focus:outline-none"
          />
        </label>
        <label className="relative h-9 w-56 max-w-full">
          <UserCircle className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:border-ring focus:outline-none"
            aria-label="Person filter"
          >
            <option value="">All people</option>
            {admins.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.display_name ?? profile.email}
              </option>
            ))}
          </select>
        </label>
        <label className="relative h-9 w-56 max-w-full">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={due}
            onChange={(event) => setDue(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:border-ring focus:outline-none"
            aria-label="Due date filter"
          >
            <option value="">All due dates</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="tomorrow">Due tomorrow</option>
            <option value="this_week">This week</option>
            <option value="this_month">This month</option>
            <option value="later">Later</option>
          </select>
        </label>
        <button
          type="button"
          aria-label="Hide done tasks"
          aria-pressed={hideDone}
          onClick={() => setHideDone((value) => !value)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
        >
          <EyeOff className="size-4" />
          Hide done
        </button>
        {viewModel.isFiltered && (
          <>
            <button
              type="button"
              className="h-9 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                setSearch("");
                setAssigneeId("");
                setDue("");
              }}
            >
              Clear filters
            </button>
            <span className="text-xs text-muted-foreground">
              Done tasks are hidden while filters are active.
            </span>
          </>
        )}
      </div>

      <SortableList
        ids={viewModel.groups.map((item) => item.group.id)}
        disabled={viewModel.isFiltered}
        onDragCancel={handleGroupDragCancel}
        onDragEnd={({ active, over }) => {
          if (over) void handleGroupDragEnd(String(active.id), String(over.id));
        }}
        onDragStart={handleGroupDragStart}
      >
        <div className="space-y-3">
          {viewModel.groups.map((item) => {
            const totalDone = doneCountsByGroupId[item.group.id] ?? item.allDoneTasks.length;
            const hiddenDoneCount = viewModel.isFiltered
              ? 0
              : hideDone
                ? 0
                : Math.max(
                    item.hiddenDoneCount,
                    totalDone - item.visibleDoneTasks.length,
                  );
            return (
              <SortableItem
                key={item.group.id}
                id={item.group.id}
                disabled={viewModel.isFiltered}
                handleDisabled={groupDragDisabled}
              >
                {(handle) => (
                  <TaskGroupSection
                    group={item.group}
                    activeTasks={item.activeTasks}
                    visibleDoneTasks={item.visibleDoneTasks}
                    hiddenDoneCount={hiddenDoneCount}
                    doneCount={totalDone}
                    admins={admins}
                    isFiltered={viewModel.isFiltered}
                    onOpenTask={onOpenTask}
                    onRefresh={onRefresh}
                    onShowMoreDone={showMoreDone}
                    onOptimisticGroupUpdate={onOptimisticGroupUpdate}
                    onOptimisticTaskUpdate={onOptimisticTaskUpdate}
                    groupDragHandle={handle}
                    isAdding={addingGroupIds.has(item.group.id)}
                    onAddingChange={(adding) => setGroupAdding(item.group.id, adding)}
                  />
                )}
              </SortableItem>
            );
          })}
        </div>
      </SortableList>
    </div>
  );
}
