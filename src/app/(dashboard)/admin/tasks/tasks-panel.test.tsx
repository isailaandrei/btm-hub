/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateTaskForm } from "./task-forms";
import { TaskBoardView } from "./task-board-view";
import type { AdminTask, Profile, TaskGroup } from "@/types/database";

vi.mock("./actions", () => ({
  archiveTaskGroupAction: vi.fn(),
  createTaskAction: vi.fn(async () => ({ success: false, resetKey: 0 })),
  reorderTaskGroupsAction: vi.fn(),
  reorderTasksAction: vi.fn(),
  updateTaskAction: vi.fn(),
  updateTaskGroupAction: vi.fn(),
}));

const group: TaskGroup = {
  id: "group-1",
  name: "Invoices",
  color: "amber",
  sort_order: 1000,
  archived_at: null,
  archived_by: null,
  created_by: null,
  updated_by: null,
  created_at: "2026-05-21T00:00:00Z",
  updated_at: "2026-05-21T00:00:00Z",
};

const admin: Profile = {
  id: "admin-1",
  email: "admin@example.com",
  display_name: "Admin",
  bio: null,
  avatar_url: null,
  role: "admin",
  preferences: {},
  created_at: "2026-05-21T00:00:00Z",
  updated_at: "2026-05-21T00:00:00Z",
};

function task(overrides: Partial<AdminTask> = {}): AdminTask {
  return {
    id: "task-1",
    group_id: "group-1",
    title: "Send invoice",
    description: "",
    assignee_id: "admin-1",
    due_date: "2026-05-21",
    status: "working_on_it",
    priority: "critical",
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

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("TaskBoardView", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders a Monday-style task table with notes and an add-task row", () => {
    act(() => {
      root.render(
        <TaskBoardView
          groups={[group]}
          tasks={[task({ description: "Meeting notes" })]}
          today="2026-05-22"
          doneCountsByGroupId={{}}
          admins={[admin]}
          onOpenTask={vi.fn()}
          onRefresh={vi.fn()}
          onShowMoreDone={vi.fn()}
        />,
      );
    });

    const groupNameInput = container.querySelector<HTMLInputElement>(
      "input[aria-label='Group name']",
    );
    expect(groupNameInput?.value).toBe("Invoices");
    expect(container.textContent).toContain("Add task");
    expect(container.textContent).not.toContain("New task");
    expect(
      container.querySelector<HTMLInputElement>(
        "input[aria-label='Add task row'][disabled]",
      ),
    ).toBeTruthy();
    expect(container.querySelector<HTMLSelectElement>("select[aria-label='Person filter']"))
      .toBeTruthy();
    expect(container.textContent).not.toContain("Filter");
    expect(container.textContent).not.toContain("Sort");
    expect(container.textContent).toContain("Hide done");
    expect(container.textContent).not.toContain("Group by");
    expect(container.textContent).toContain("Notes");
    expect(container.querySelector<HTMLInputElement>("input[aria-label=\"Task notes\"]")?.value).toBe("Meeting notes");
    expect(container.textContent).toContain("Working on it");
    expect(container.textContent).toContain("Critical");
    expect(container.textContent).not.toContain("Contact");
  });

  it("can hide done tasks", () => {
    act(() => {
      root.render(
        <TaskBoardView
          groups={[group]}
          tasks={[
            task({ id: "active", title: "Active task", status: "working_on_it" }),
            task({
              id: "done",
              title: "Done task",
              status: "done",
              completed_at: "2026-05-21T00:00:00Z",
            }),
          ]}
          today="2026-05-22"
          doneCountsByGroupId={{ "group-1": 1 }}
          admins={[admin]}
          onOpenTask={vi.fn()}
          onRefresh={vi.fn()}
          onShowMoreDone={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain("Done task");

    const hideDone = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Hide done tasks']",
    );
    expect(hideDone).toBeTruthy();

    act(() => {
      hideDone!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).not.toContain("Done task");
    expect(container.textContent).toContain("Active task");
  });

  it("shows only the first 10 done tasks before show more", () => {
    const doneTasks = Array.from({ length: 12 }, (_, index) =>
      task({
        id: `done-${index}`,
        title: `Done task ${index}`,
        status: "done",
        completed_at: `2026-05-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      }),
    );

    act(() => {
      root.render(
        <TaskBoardView
          groups={[group]}
          tasks={doneTasks}
          today="2026-05-22"
          doneCountsByGroupId={{ "group-1": 12 }}
          admins={[admin]}
          onOpenTask={vi.fn()}
          onRefresh={vi.fn()}
          onShowMoreDone={vi.fn()}
        />,
      );
    });

    expect(container.querySelectorAll("button"))
      .toBeTruthy();
    expect(container.textContent).toContain("Show 2 more done tasks");
    expect(container.textContent).not.toContain("Done task 0");
  });

  it("does not offer partial done-task results while filters are active", () => {
    const doneTasks = Array.from({ length: 12 }, (_, index) =>
      task({
        id: `done-${index}`,
        title: `Invoice done ${index}`,
        status: "done",
        completed_at: `2026-05-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      }),
    );

    act(() => {
      root.render(
        <TaskBoardView
          groups={[group]}
          tasks={[task({ id: "active", title: "Send invoice" }), ...doneTasks]}
          today="2026-05-22"
          doneCountsByGroupId={{ "group-1": 12 }}
          admins={[admin]}
          onOpenTask={vi.fn()}
          onRefresh={vi.fn()}
          onShowMoreDone={vi.fn()}
        />,
      );
    });

    const searchInput = container.querySelector<HTMLInputElement>(
      "input[placeholder='Search tasks']",
    );
    expect(searchInput).toBeTruthy();

    act(() => {
      setInputValue(searchInput!, "invoice");
    });

    expect(container.textContent).toContain("Done tasks are hidden while filters are active.");
    expect(container.textContent).not.toContain("Show");
  });

  it("reserves helper space for every create-task field", () => {
    act(() => {
      root.render(
        <CreateTaskForm
          group={group}
          admins={[admin]}
          onSuccess={vi.fn()}
        />,
      );
    });

    expect(container.querySelectorAll("[data-task-form-helper]")).toHaveLength(5);
  });
});
