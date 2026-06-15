import type { AdminTask, TaskGroup } from "@/types/database";

export type TaskDueFilter =
  | "overdue"
  | "today"
  | "tomorrow"
  | "this_week"
  | "this_month"
  | "later";

export interface TaskBoardFilters {
  search?: string;
  assigneeId?: string;
  due?: TaskDueFilter;
  today?: string;
}

export interface TaskGroupViewModel {
  group: TaskGroup;
  activeTasks: AdminTask[];
  visibleDoneTasks: AdminTask[];
  allDoneTasks: AdminTask[];
  hiddenDoneCount: number;
}

export interface TaskBoardViewModel {
  groups: TaskGroupViewModel[];
  isFiltered: boolean;
}

function sortActiveTasks(left: AdminTask, right: AdminTask) {
  return left.sort_order - right.sort_order || left.created_at.localeCompare(right.created_at);
}

function sortDoneTasks(left: AdminTask, right: AdminTask) {
  return (
    (right.completed_at ?? "").localeCompare(left.completed_at ?? "") ||
    right.id.localeCompare(left.id)
  );
}

function toUtcDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number): string {
  const date = toUtcDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

function endOfWeek(dateString: string): string {
  const date = toUtcDate(dateString);
  const mondayBasedDay = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() + (6 - mondayBasedDay));
  return formatUtcDate(date);
}

function endOfMonth(dateString: string): string {
  const date = toUtcDate(dateString);
  return formatUtcDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

function matchesDueFilter(task: AdminTask, filters: TaskBoardFilters): boolean {
  if (!filters.due) return true;
  if (!task.due_date || !filters.today) return false;

  const tomorrow = addDays(filters.today, 1);
  const weekEnd = endOfWeek(filters.today);
  const monthEnd = endOfMonth(filters.today);

  switch (filters.due) {
    case "overdue":
      return task.due_date < filters.today;
    case "today":
      return task.due_date === filters.today;
    case "tomorrow":
      return task.due_date === tomorrow;
    case "this_week":
      return task.due_date >= filters.today && task.due_date <= weekEnd;
    case "this_month":
      return task.due_date >= filters.today && task.due_date <= monthEnd;
    case "later":
      return task.due_date > monthEnd;
  }
}

function matchesFilters(task: AdminTask, filters: TaskBoardFilters): boolean {
  const search = filters.search?.trim().toLowerCase();
  if (search) {
    const haystack = `${task.title} ${task.description}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  if (filters.assigneeId && task.assignee_id !== filters.assigneeId) return false;
  if (!matchesDueFilter(task, filters)) return false;

  return true;
}

function hasFilters(filters: TaskBoardFilters): boolean {
  return Boolean(
    filters.search?.trim() ||
      filters.assigneeId ||
      filters.due,
  );
}

export function orderTaskGroupsByIds(
  groups: TaskGroup[],
  orderedIds: string[] | null,
): TaskGroup[] {
  const sortedGroups = [...groups].sort(
    (left, right) => left.sort_order - right.sort_order,
  );
  if (!orderedIds || orderedIds.length !== sortedGroups.length) return sortedGroups;

  const groupsById = new Map(sortedGroups.map((group) => [group.id, group]));
  const orderedGroups = orderedIds.map((id) => groupsById.get(id));
  if (orderedGroups.some((group) => !group)) return sortedGroups;

  return orderedGroups as TaskGroup[];
}

export function orderTasksByIds(
  tasks: AdminTask[],
  orderedIds: string[] | null,
): AdminTask[] {
  const sortedTasks = [...tasks].sort(sortActiveTasks);
  if (!orderedIds || orderedIds.length !== sortedTasks.length) return sortedTasks;

  const tasksById = new Map(sortedTasks.map((task) => [task.id, task]));
  const orderedTasks = orderedIds.map((id) => tasksById.get(id));
  if (orderedTasks.some((task) => !task)) return sortedTasks;

  return orderedTasks as AdminTask[];
}

export function idsMatchOrder(
  items: Array<{ id: string }>,
  orderedIds: string[] | null,
) {
  return Boolean(
    orderedIds &&
      orderedIds.length === items.length &&
      items.every((item, index) => item.id === orderedIds[index]),
  );
}

export function getPendingOptimisticIds(
  items: Array<{ id: string }>,
  orderedIds: string[] | null,
) {
  if (!orderedIds || orderedIds.length !== items.length) return null;

  const orderedIdSet = new Set(orderedIds);
  if (orderedIdSet.size !== orderedIds.length) return null;

  const itemIds = new Set(items.map((item) => item.id));
  if (orderedIds.some((id) => !itemIds.has(id))) return null;

  return idsMatchOrder(items, orderedIds) ? null : orderedIds;
}

export function buildTaskBoardViewModel(input: {
  groups: TaskGroup[];
  tasks: AdminTask[];
  hideDone: boolean;
  expandedDoneGroupIds: Set<string>;
  doneLimit: number;
  filters?: TaskBoardFilters;
}): TaskBoardViewModel {
  const filters = input.filters ?? {};
  const isFiltered = hasFilters(filters);

  const groups = input.groups
    .filter((group) => !group.archived_at)
    .map((group) => {
      const groupTasks = input.tasks.filter(
        (task) => task.group_id === group.id && !task.archived_at,
      );

      const activeTasks = groupTasks
        .filter((task) => task.status !== "done")
        .filter((task) => matchesFilters(task, filters))
        .sort(sortActiveTasks);

      const allDoneTasks =
        input.hideDone || isFiltered
          ? []
          : groupTasks
              .filter((task) => task.status === "done")
              .sort(sortDoneTasks);

      const doneLimit = Math.max(0, input.doneLimit);
      const isExpanded = input.expandedDoneGroupIds.has(group.id);
      const visibleDoneTasks = isExpanded
        ? allDoneTasks
        : allDoneTasks.slice(0, doneLimit);

      return {
        group,
        activeTasks,
        visibleDoneTasks,
        allDoneTasks,
        hiddenDoneCount: Math.max(0, allDoneTasks.length - visibleDoneTasks.length),
      };
    });

  return { groups, isFiltered };
}
