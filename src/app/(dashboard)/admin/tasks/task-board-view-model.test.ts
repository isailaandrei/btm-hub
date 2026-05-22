import { describe, expect, it } from "vitest";
import {
  buildTaskBoardViewModel,
  getPendingOptimisticIds,
  idsMatchOrder,
  orderTaskGroupsByIds,
  orderTasksByIds,
} from "./task-board-view-model";
import type { AdminTask, TaskGroup } from "@/types/database";

function group(overrides: Partial<TaskGroup> = {}): TaskGroup {
  return {
    id: "group-1",
    name: "General",
    color: "blue",
    sort_order: 1000,
    archived_at: null,
    archived_by: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-05-21T00:00:00Z",
    updated_at: "2026-05-21T00:00:00Z",
    ...overrides,
  };
}

function task(overrides: Partial<AdminTask> = {}): AdminTask {
  return {
    id: "task-1",
    group_id: "group-1",
    title: "Call partner",
    description: "",
    assignee_id: null,
    due_date: null,
    status: "not_started",
    priority: "normal",
    sort_order: 1000,
    completed_at: null,
    archived_at: null,
    archived_by: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-05-21T00:00:00Z",
    updated_at: "2026-05-21T00:00:00Z",
    ...overrides,
  };
}

describe("buildTaskBoardViewModel", () => {
  it("preserves the supplied group order for optimistic drag previews", () => {
    const vm = buildTaskBoardViewModel({
      groups: [
        group({ id: "group-2", name: "Second", sort_order: 2000 }),
        group({ id: "group-1", name: "First", sort_order: 1000 }),
      ],
      tasks: [],
      hideDone: false,
      expandedDoneGroupIds: new Set(),
      doneLimit: 10,
    });

    expect(vm.groups.map((item) => item.group.name)).toEqual([
      "Second",
      "First",
    ]);
  });

  it("shows done tasks by default with the newest completion first", () => {
    const vm = buildTaskBoardViewModel({
      groups: [group()],
      tasks: [
        task({ id: "old", status: "done", completed_at: "2026-05-20T00:00:00Z" }),
        task({ id: "new", status: "done", completed_at: "2026-05-21T00:00:00Z" }),
      ],
      hideDone: false,
      expandedDoneGroupIds: new Set(),
      doneLimit: 10,
    });

    expect(vm.groups[0].visibleDoneTasks.map((item) => item.id)).toEqual([
      "new",
      "old",
    ]);
  });

  it("caps done tasks and reports the hidden count", () => {
    const tasks = Array.from({ length: 12 }, (_, index) =>
      task({
        id: `done-${index}`,
        status: "done",
        completed_at: `2026-05-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      }),
    );

    const vm = buildTaskBoardViewModel({
      groups: [group()],
      tasks,
      hideDone: false,
      expandedDoneGroupIds: new Set(),
      doneLimit: 10,
    });

    expect(vm.groups[0].visibleDoneTasks).toHaveLength(10);
    expect(vm.groups[0].hiddenDoneCount).toBe(2);
  });

  it("hides done tasks when requested", () => {
    const vm = buildTaskBoardViewModel({
      groups: [group()],
      tasks: [task({ status: "done", completed_at: "2026-05-21T00:00:00Z" })],
      hideDone: true,
      expandedDoneGroupIds: new Set(),
      doneLimit: 10,
    });

    expect(vm.groups[0].visibleDoneTasks).toEqual([]);
  });

  it("excludes archived groups and tasks", () => {
    const vm = buildTaskBoardViewModel({
      groups: [group(), group({ id: "archived", archived_at: "2026-05-21T00:00:00Z" })],
      tasks: [task(), task({ id: "archived-task", archived_at: "2026-05-21T00:00:00Z" })],
      hideDone: false,
      expandedDoneGroupIds: new Set(),
      doneLimit: 10,
    });

    expect(vm.groups).toHaveLength(1);
    expect(vm.groups[0].activeTasks.map((item) => item.id)).toEqual(["task-1"]);
  });

  it("marks filtered views so drag handles can be disabled", () => {
    const vm = buildTaskBoardViewModel({
      groups: [group()],
      tasks: [task()],
      hideDone: false,
      expandedDoneGroupIds: new Set(),
      doneLimit: 10,
      filters: { search: "partner" },
    });

    expect(vm.isFiltered).toBe(true);
  });

  it("hides done tasks while filters are active because done tasks are loaded in partial slices", () => {
    const vm = buildTaskBoardViewModel({
      groups: [group()],
      tasks: [
        task({ id: "active-match", title: "Send invoice" }),
        task({
          id: "done-match",
          title: "Send invoice receipt",
          status: "done",
          completed_at: "2026-05-21T00:00:00Z",
        }),
      ],
      hideDone: false,
      expandedDoneGroupIds: new Set(),
      doneLimit: 10,
      filters: { search: "invoice" },
    });

    expect(vm.groups[0].activeTasks.map((item) => item.id)).toEqual([
      "active-match",
    ]);
    expect(vm.groups[0].visibleDoneTasks).toEqual([]);
    expect(vm.groups[0].hiddenDoneCount).toBe(0);
  });

  it("filters tasks by assignee", () => {
    const vm = buildTaskBoardViewModel({
      groups: [group()],
      tasks: [
        task({ id: "assigned", assignee_id: "admin-1" }),
        task({ id: "other", assignee_id: "admin-2" }),
        task({ id: "unassigned", assignee_id: null }),
      ],
      hideDone: false,
      expandedDoneGroupIds: new Set(),
      doneLimit: 10,
      filters: { assigneeId: "admin-1" },
    });

    expect(vm.groups[0].activeTasks.map((item) => item.id)).toEqual([
      "assigned",
    ]);
    expect(vm.isFiltered).toBe(true);
  });

  it.each([
    ["overdue", ["overdue"]],
    ["today", ["today"]],
    ["tomorrow", ["tomorrow"]],
    ["this_week", ["today", "tomorrow", "sunday"]],
    ["this_month", ["today", "tomorrow", "sunday", "month-end"]],
    ["later", ["next-month"]],
  ] as const)("filters tasks by due bucket %s", (due, expectedIds) => {
    const vm = buildTaskBoardViewModel({
      groups: [group()],
      tasks: [
        task({ id: "overdue", due_date: "2026-05-21" }),
        task({ id: "today", due_date: "2026-05-22" }),
        task({ id: "tomorrow", due_date: "2026-05-23" }),
        task({ id: "sunday", due_date: "2026-05-24" }),
        task({ id: "month-end", due_date: "2026-05-31" }),
        task({ id: "next-month", due_date: "2026-06-01" }),
        task({ id: "no-date", due_date: null }),
      ],
      hideDone: false,
      expandedDoneGroupIds: new Set(),
      doneLimit: 10,
      filters: { due, today: "2026-05-22" },
    });

    expect(vm.groups[0].activeTasks.map((item) => item.id)).toEqual(expectedIds);
    expect(vm.isFiltered).toBe(true);
  });
});

describe("orderTaskGroupsByIds", () => {
  it("keeps the optimistic drag order even before persisted sort_order changes", () => {
    const groups = [
      group({ id: "group-1", name: "First", sort_order: 1000 }),
      group({ id: "group-2", name: "Second", sort_order: 2000 }),
      group({ id: "group-3", name: "Third", sort_order: 3000 }),
    ];

    expect(orderTaskGroupsByIds(groups, ["group-3", "group-1", "group-2"]).map((item) => item.name))
      .toEqual(["Third", "First", "Second"]);
  });

  it("falls back to sort_order when the optimistic order is stale", () => {
    const groups = [
      group({ id: "group-2", name: "Second", sort_order: 2000 }),
      group({ id: "group-1", name: "First", sort_order: 1000 }),
    ];

    expect(orderTaskGroupsByIds(groups, ["group-2"]).map((item) => item.name)).toEqual([
      "First",
      "Second",
    ]);
  });
});

describe("orderTasksByIds", () => {
  it("keeps the optimistic drag order even before persisted sort_order changes", () => {
    const tasks = [
      task({ id: "task-1", title: "First", sort_order: 1000 }),
      task({ id: "task-2", title: "Second", sort_order: 2000 }),
      task({ id: "task-3", title: "Third", sort_order: 3000 }),
    ];

    expect(orderTasksByIds(tasks, ["task-3", "task-1", "task-2"]).map((item) => item.title))
      .toEqual(["Third", "First", "Second"]);
  });

  it("falls back to sort_order when the optimistic order is stale", () => {
    const tasks = [
      task({ id: "task-2", title: "Second", sort_order: 2000 }),
      task({ id: "task-1", title: "First", sort_order: 1000 }),
    ];

    expect(orderTasksByIds(tasks, ["task-2"]).map((item) => item.title)).toEqual([
      "First",
      "Second",
    ]);
  });
});

describe("idsMatchOrder", () => {
  it("detects when refreshed data has caught up to an optimistic order", () => {
    expect(
      idsMatchOrder(
        [
          { id: "task-3" },
          { id: "task-1" },
          { id: "task-2" },
        ],
        ["task-3", "task-1", "task-2"],
      ),
    ).toBe(true);
    expect(
      idsMatchOrder(
        [
          { id: "task-1" },
          { id: "task-2" },
          { id: "task-3" },
        ],
        ["task-3", "task-1", "task-2"],
      ),
    ).toBe(false);
  });
});

describe("getPendingOptimisticIds", () => {
  it("keeps an optimistic order only while persisted items have not caught up", () => {
    expect(
      getPendingOptimisticIds(
        [
          { id: "item-1" },
          { id: "item-2" },
        ],
        ["item-2", "item-1"],
      ),
    ).toEqual(["item-2", "item-1"]);

    expect(
      getPendingOptimisticIds(
        [
          { id: "item-2" },
          { id: "item-1" },
        ],
        ["item-2", "item-1"],
      ),
    ).toBeNull();
  });

  it("drops stale optimistic orders when membership changes", () => {
    expect(
      getPendingOptimisticIds(
        [
          { id: "item-1" },
          { id: "item-2" },
        ],
        ["item-2"],
      ),
    ).toBeNull();

    expect(
      getPendingOptimisticIds(
        [
          { id: "item-1" },
          { id: "item-2" },
        ],
        ["item-2", "item-2"],
      ),
    ).toBeNull();
  });
});
