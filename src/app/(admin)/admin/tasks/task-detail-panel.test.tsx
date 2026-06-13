/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminTask, Profile, TaskGroup } from "@/types/database";
import { TaskDetailPanel } from "./task-detail-panel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  updateTaskAction: vi.fn().mockResolvedValue({ id: "task-1" }),
  deleteTaskAction: vi.fn().mockResolvedValue(undefined),
  refreshAfterMutation: vi.fn().mockResolvedValue(undefined),
  optimisticallyUpdateTask: vi.fn(),
  optimisticallyRemoveTask: vi.fn(),
}));

vi.mock("./actions", () => ({
  deleteTaskAction: mocks.deleteTaskAction,
  moveTaskToGroupAction: vi.fn(),
  updateTaskAction: mocks.updateTaskAction,
}));

vi.mock("./task-data-provider", () => ({
  buildOptimisticTaskPatch: (_task: AdminTask, patch: Record<string, unknown>) => {
    const optimisticPatch: Record<string, unknown> = {};
    if (patch.title !== undefined) optimisticPatch.title = patch.title;
    if (patch.description !== undefined) optimisticPatch.description = patch.description;
    return optimisticPatch;
  },
  useTaskData: () => ({
    commentsByTaskId: {},
    commentsError: null,
    ensureComments: vi.fn().mockResolvedValue(undefined),
    reloadComments: vi.fn().mockResolvedValue(undefined),
    refreshAfterMutation: mocks.refreshAfterMutation,
    optimisticallyUpdateTask: mocks.optimisticallyUpdateTask,
    optimisticallyRemoveTask: mocks.optimisticallyRemoveTask,
  }),
}));

vi.mock("./task-forms", () => ({
  CreateTaskCommentForm: () => <form aria-label="Comment form" />,
}));

const group: TaskGroup = {
  id: "group-1",
  name: "Invoices",
  color: "blue",
  sort_order: 1000,
  archived_at: null,
  archived_by: null,
  created_by: null,
  updated_by: null,
  created_at: "2026-05-21T00:00:00Z",
  updated_at: "2026-05-21T00:00:00Z",
};

const task: AdminTask = {
  id: "task-1",
  group_id: "group-1",
  title: "Send invoice",
  description: "Initial notes",
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

function setTextAreaValue(textarea: HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  valueSetter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("TaskDetailPanel", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function renderPanel() {
    act(() => {
      root.render(
        <TaskDetailPanel
          task={task}
          groups={[group]}
          tasks={[task]}
          admins={[admin]}
          open
          onOpenChange={vi.fn()}
        />,
      );
    });
  }

  it("deletes the task from the detail panel", async () => {
    const onOpenChange = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);

    act(() => {
      root.render(
        <TaskDetailPanel
          task={task}
          groups={[group]}
          tasks={[task]}
          admins={[admin]}
          open
          onOpenChange={onOpenChange}
        />,
      );
    });

    const button = [...document.body.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "Delete task",
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mocks.optimisticallyRemoveTask).toHaveBeenCalledWith("task-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.deleteTaskAction).toHaveBeenCalledWith("task-1");
  });

  it("provides an explicit save control for the task title", async () => {
    renderPanel();

    const titleInput = document.body.querySelector<HTMLInputElement>(
      "input[aria-label='Task title']",
    );
    expect(titleInput).toBeTruthy();

    await act(async () => {
      setInputValue(titleInput!, "Send updated invoice");
    });

    expect(document.body.textContent).toContain("Unsaved title changes");

    const button = [...document.body.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "Save title",
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.updateTaskAction).toHaveBeenCalledWith({
      taskId: "task-1",
      title: "Send updated invoice",
    });
    expect(mocks.optimisticallyUpdateTask).toHaveBeenCalledWith("task-1", {
      title: "Send updated invoice",
    });
    expect(mocks.refreshAfterMutation).not.toHaveBeenCalled();
  });

  it("shows distinct saving and saved states for the task title", async () => {
    let resolveUpdate: (value: { id: string }) => void = () => {};
    mocks.updateTaskAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    renderPanel();

    const titleInput = document.body.querySelector<HTMLInputElement>(
      "input[aria-label='Task title']",
    );
    expect(titleInput).toBeTruthy();

    await act(async () => {
      setInputValue(titleInput!, "Send updated invoice");
    });

    const button = [...document.body.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "Save title",
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(button!.textContent).toContain("Saving");
    expect(document.body.textContent).toContain("Saving title");

    await act(async () => {
      resolveUpdate({ id: "task-1" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(button!.textContent).toContain("Saved");
    expect(document.body.textContent).toContain("Title saved");
  });

  it("provides an explicit save control for task notes", async () => {
    renderPanel();

    const textarea = document.body.querySelector<HTMLTextAreaElement>(
      "textarea[aria-label='Task notes']",
    );
    expect(textarea).toBeTruthy();

    await act(async () => {
      setTextAreaValue(textarea!, "Updated notes");
    });

    const button = [...document.body.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "Save notes",
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.updateTaskAction).toHaveBeenCalledWith({
      taskId: "task-1",
      description: "Updated notes",
    });
    expect(mocks.optimisticallyUpdateTask).toHaveBeenCalledWith("task-1", {
      description: "Updated notes",
    });
    expect(mocks.refreshAfterMutation).not.toHaveBeenCalled();
  });

  it("shows distinct saving and saved states for task notes", async () => {
    let resolveUpdate: (value: { id: string }) => void = () => {};
    mocks.updateTaskAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    renderPanel();

    const textarea = document.body.querySelector<HTMLTextAreaElement>(
      "textarea[aria-label='Task notes']",
    );
    expect(textarea).toBeTruthy();

    await act(async () => {
      setTextAreaValue(textarea!, "Updated notes");
    });

    const button = [...document.body.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "Save notes",
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(button!.textContent).toContain("Saving");
    expect(document.body.textContent).toContain("Saving notes");

    await act(async () => {
      resolveUpdate({ id: "task-1" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(button!.textContent).toContain("Saved");
    expect(document.body.textContent).toContain("Notes saved");
  });
});
