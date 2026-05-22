import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateTask = vi.fn().mockResolvedValue({ id: "task-1" });
const mockCreateTaskComment = vi.fn().mockResolvedValue({ id: "comment-1" });
const mockReorderTasks = vi.fn();
const mockMoveTaskToGroup = vi.fn();
const mockArchiveTaskGroup = vi.fn();
const mockUpdateTask = vi.fn().mockResolvedValue({ id: "task-1" });

vi.mock("@/lib/data/tasks", () => ({
  archiveTask: vi.fn(),
  archiveTaskGroup: mockArchiveTaskGroup,
  createTask: mockCreateTask,
  createTaskComment: mockCreateTaskComment,
  createTaskGroup: vi.fn().mockResolvedValue({ id: "group-1" }),
  moveTaskToGroup: mockMoveTaskToGroup,
  reorderTaskGroups: vi.fn(),
  reorderTasks: mockReorderTasks,
  updateTask: mockUpdateTask,
  updateTaskGroup: vi.fn(),
}));

const actions = await import("./actions");

const VALID_GROUP_ID = "00000000-0000-4000-8000-000000000001";
const VALID_TASK_ID = "00000000-0000-4000-8000-000000000002";

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
}

describe("task actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects blank task titles", async () => {
    const result = await actions.createTaskAction(
      { resetKey: 0 },
      form({
        groupId: VALID_GROUP_ID,
        title: " ",
        status: "not_started",
        priority: "normal",
      }),
    );

    expect(result.success).toBe(false);
    expect(result.errors?.title).toBeDefined();
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  it("rejects invalid statuses", async () => {
    const result = await actions.createTaskAction(
      { resetKey: 0 },
      form({
        groupId: VALID_GROUP_ID,
        title: "Call partner",
        status: "blocked",
        priority: "normal",
      }),
    );

    expect(result.success).toBe(false);
    expect(result.errors?.status).toBeDefined();
  });

  it("accepts nullable task fields", async () => {
    await actions.createTaskAction(
      { resetKey: 0 },
      form({
        groupId: VALID_GROUP_ID,
        title: "Call partner",
        description: "",
        assigneeId: "",
        dueDate: "",
        status: "not_started",
        priority: "normal",
      }),
    );

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        assigneeId: null,
        dueDate: null,
      }),
    );
  });

  it("rejects blank comments", async () => {
    const result = await actions.createTaskCommentAction(
      { resetKey: 0 },
      form({ taskId: VALID_TASK_ID, body: " " }),
    );

    expect(result.success).toBe(false);
    expect(result.errors?.body).toBeDefined();
    expect(mockCreateTaskComment).not.toHaveBeenCalled();
  });

  it("validates reorder UUIDs before data calls", async () => {
    await expect(
      actions.reorderTasksAction(VALID_GROUP_ID, ["not-a-uuid"]),
    ).rejects.toThrow("Invalid task ID");
    expect(mockReorderTasks).not.toHaveBeenCalled();
  });

  it("validates move UUIDs before data calls", async () => {
    await expect(
      actions.moveTaskToGroupAction(VALID_TASK_ID, "bad", []),
    ).rejects.toThrow("Invalid task group ID");
    expect(mockMoveTaskToGroup).not.toHaveBeenCalled();
  });

  it("rejects group changes through updateTaskAction", async () => {
    await expect(
      actions.updateTaskAction({ taskId: VALID_TASK_ID, group_id: VALID_GROUP_ID }),
    ).rejects.toThrow("Use moveTaskToGroupAction");
    expect(mockUpdateTask).not.toHaveBeenCalled();
  });

  it("archives groups", async () => {
    await actions.archiveTaskGroupAction(VALID_GROUP_ID);

    expect(mockArchiveTaskGroup).toHaveBeenCalledWith(VALID_GROUP_ID);
  });
});
