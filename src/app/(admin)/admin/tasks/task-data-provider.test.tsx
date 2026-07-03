/**
 * @vitest-environment jsdom
 */

import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminAssigneeProfile,
  AdminTask,
  TaskGroup,
} from "@/types/database";
import type { TaskBoardData } from "./task-loaders";

const mocks = vi.hoisted(() => ({
  loadMoreDoneTasksForDateBucketAction: vi.fn(),
  loadMoreDoneTasksForGroupAction: vi.fn(),
  loadTaskBoardDataAction: vi.fn(),
  loadTaskCommentsAction: vi.fn(),
  loadTaskDateViewDataAction: vi.fn(),
  logAdminTiming: vi.fn(),
  removeChannel: vi.fn(),
  startAdminTiming: vi.fn(() => 0),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  subscribeStatusCallback: null as ((status: string) => void) | null,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  },
}));

vi.mock("@/lib/admin/timing", () => ({
  logAdminTiming: mocks.logAdminTiming,
  startAdminTiming: mocks.startAdminTiming,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn((cb?: (status: string) => void) => {
        if (cb) mocks.subscribeStatusCallback = cb;
        return channel;
      }),
    };

    return {
      channel: vi.fn(() => channel),
      removeChannel: mocks.removeChannel,
    };
  },
}));

vi.mock("./task-loaders", () => ({
  loadMoreDoneTasksForDateBucketAction:
    mocks.loadMoreDoneTasksForDateBucketAction,
  loadMoreDoneTasksForGroupAction: mocks.loadMoreDoneTasksForGroupAction,
  loadTaskBoardDataAction: mocks.loadTaskBoardDataAction,
  loadTaskCommentsAction: mocks.loadTaskCommentsAction,
  loadTaskDateViewDataAction: mocks.loadTaskDateViewDataAction,
}));

const { TaskDataProvider, useTaskData } = await import("./task-data-provider");

const admin: AdminAssigneeProfile = {
  id: "admin-1",
  avatar_url: null,
  created_at: "2026-05-21T00:00:00Z",
  display_name: "Admin",
  email: "admin@example.com",
  role: "admin",
  updated_at: "2026-05-21T00:00:00Z",
};

const group: TaskGroup = {
  id: "group-1",
  archived_at: null,
  archived_by: null,
  color: "blue",
  created_at: "2026-05-21T00:00:00Z",
  created_by: null,
  name: "Follow ups",
  sort_order: 1000,
  updated_at: "2026-05-21T00:00:00Z",
  updated_by: null,
};

const task: AdminTask = {
  id: "task-1",
  archived_at: null,
  archived_by: null,
  assignee_id: "admin-1",
  completed_at: null,
  created_at: "2026-05-21T00:00:00Z",
  created_by: null,
  description: "",
  due_date: null,
  group_id: "group-1",
  priority: "normal",
  sort_order: 1000,
  status: "not_started",
  title: "Follow up",
  updated_at: "2026-05-21T00:00:00Z",
  updated_by: null,
};

function makeTaskBoardData(): TaskBoardData {
  return {
    activeTasks: [task],
    admins: [admin],
    doneCountsByGroupId: { "group-1": 0 },
    doneCursorsByGroupId: { "group-1": null },
    doneTasks: [],
    groups: [group],
    today: "2026-05-22",
  };
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function TaskDataConsumer() {
  const { admins, groups, tasks, today, ensureTasks } = useTaskData();

  useEffect(() => {
    ensureTasks();
  }, [ensureTasks]);

  return (
    <output>
      {admins?.length ?? "loading"}:{groups?.length ?? "loading"}:
      {tasks?.length ?? "loading"}:{today ?? "loading"}
    </output>
  );
}

function ToggleShell() {
  const [showConsumer, setShowConsumer] = useState(true);

  return (
    <TaskDataProvider>
      <button type="button" onClick={() => setShowConsumer((value) => !value)}>
        Toggle
      </button>
      {showConsumer ? <TaskDataConsumer /> : <span>Hidden</span>}
    </TaskDataProvider>
  );
}

function MutationConsumer() {
  const { groups, realtimeWarning, ensureTasks, refreshAfterMutation } =
    useTaskData();

  useEffect(() => {
    ensureTasks();
  }, [ensureTasks]);

  return (
    <div>
      <output>
        {groups ? "loaded" : "loading"}:{realtimeWarning ?? "connected"}
      </output>
      <button type="button" onClick={() => void refreshAfterMutation()}>
        Mutate
      </button>
    </div>
  );
}

describe("TaskDataProvider", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.clearAllMocks();
    mocks.loadTaskBoardDataAction.mockResolvedValue(makeTaskBoardData());
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps task board data across consumer remounts", async () => {
    await act(async () => {
      root.render(<ToggleShell />);
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe(
      "1:1:1:2026-05-22",
    );
    expect(mocks.loadTaskBoardDataAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      container
        .querySelector("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      container
        .querySelector("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe(
      "1:1:1:2026-05-22",
    );
    expect(mocks.loadTaskBoardDataAction).toHaveBeenCalledTimes(1);
  });

  it("reloads the board on refreshAfterMutation so a failed optimistic patch reverts", async () => {
    await act(async () => {
      root.render(
        <TaskDataProvider>
          <MutationConsumer />
        </TaskDataProvider>,
      );
    });
    await flushAsyncWork();
    expect(mocks.loadTaskBoardDataAction).toHaveBeenCalledTimes(1);

    // refreshAfterMutation must ALWAYS reload: its error-path callers rely on it
    // to revert an optimistic patch after a failed write, and a failed write
    // produces no realtime echo — so a "skip when connected" gate would leave a
    // fake success on screen. (The realtime echo may add a redundant reload on
    // the success path; correctness of the revert wins.)
    await act(async () => {
      container
        .querySelector("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(mocks.loadTaskBoardDataAction).toHaveBeenCalledTimes(2);
  });

  it("clears the sticky warning and resyncs when realtime recovers", async () => {
    await act(async () => {
      root.render(
        <TaskDataProvider>
          <MutationConsumer />
        </TaskDataProvider>,
      );
    });
    await flushAsyncWork();
    expect(mocks.loadTaskBoardDataAction).toHaveBeenCalledTimes(1);
    expect(container.querySelector("output")?.textContent).toContain(
      "connected",
    );

    // Drop: a warning appears and is not cleared on its own.
    await act(async () => {
      mocks.subscribeStatusCallback?.("CHANNEL_ERROR");
    });
    expect(container.querySelector("output")?.textContent).toContain(
      "disconnected",
    );

    // Recover: warning clears and the board resyncs (postgres_changes cannot
    // replay the gap).
    await act(async () => {
      mocks.subscribeStatusCallback?.("SUBSCRIBED");
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toContain(
      "connected",
    );
    expect(mocks.loadTaskBoardDataAction).toHaveBeenCalledTimes(2);
  });

  it("warns only once while realtime stays degraded", async () => {
    await act(async () => {
      root.render(
        <TaskDataProvider>
          <MutationConsumer />
        </TaskDataProvider>,
      );
    });
    await flushAsyncWork();

    await act(async () => {
      mocks.subscribeStatusCallback?.("CHANNEL_ERROR");
      mocks.subscribeStatusCallback?.("TIMED_OUT");
      mocks.subscribeStatusCallback?.("CHANNEL_ERROR");
    });

    expect(mocks.toastWarning).toHaveBeenCalledTimes(1);
  });
});
