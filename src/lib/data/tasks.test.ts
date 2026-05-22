import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

const mockRequireAdmin = vi.fn().mockResolvedValue({ id: "admin-1" });
const mockSupabase = createMockSupabaseClient();

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockSupabase.client),
}));

describe("task data helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.mockQueryResult(null);
    mockSupabase.client.rpc = vi.fn().mockResolvedValue(mockSupabase.result);
  });

  it("creates task groups through RPC", async () => {
    const { createTaskGroup } = await import("./tasks");

    await createTaskGroup({ name: "Invoices", color: "amber" });

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(mockSupabase.client.rpc).toHaveBeenCalledWith("create_task_group", {
      p_name: "Invoices",
      p_color: "amber",
    });
  });

  it("updates tasks without accepting a group_id parameter", async () => {
    const { updateTask } = await import("./tasks");

    await updateTask("task-1", {
      title: "Send invoice",
      assigneeId: null,
      dueDate: null,
      status: "done",
    });

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith("update_task", {
      p_task_id: "task-1",
      p_title: "Send invoice",
      p_description: null,
      p_assignee_id: null,
      p_clear_assignee: true,
      p_due_date: null,
      p_clear_due_date: true,
      p_status: "done",
      p_priority: null,
    });
    expect(mockSupabase.client.rpc).not.toHaveBeenCalledWith(
      "update_task",
      expect.objectContaining({ p_group_id: expect.anything() }),
    );
  });

  it("moves tasks through the move RPC", async () => {
    const { moveTaskToGroup } = await import("./tasks");

    await moveTaskToGroup({
      taskId: "task-1",
      targetGroupId: "group-2",
      targetTaskIds: ["task-2", "task-1"],
    });

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith(
      "move_active_task_to_group",
      {
        p_task_id: "task-1",
        p_target_group_id: "group-2",
        p_target_task_ids: ["task-2", "task-1"],
      },
    );
  });

  it("reorders active tasks through RPC", async () => {
    const { reorderTasks } = await import("./tasks");

    await reorderTasks("group-1", ["task-2", "task-1"]);

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith(
      "reorder_active_tasks",
      {
        p_group_id: "group-1",
        p_task_ids: ["task-2", "task-1"],
      },
    );
  });

  it("surfaces Supabase errors", async () => {
    const { createTaskComment } = await import("./tasks");
    mockSupabase.client.rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });

    await expect(
      createTaskComment({ taskId: "task-1", body: "Called today" }),
    ).rejects.toThrow("Failed to create task comment: boom");
  });
});
