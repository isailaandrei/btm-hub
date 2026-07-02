import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetEmailWorkerOrigin = vi.fn();
const mockGetEmailWorkerSecret = vi.fn();

vi.mock("./settings", () => ({
  getEmailWorkerOrigin: mockGetEmailWorkerOrigin,
  getEmailWorkerSecret: mockGetEmailWorkerSecret,
}));

describe("triggerEmailWorker", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    mockGetEmailWorkerOrigin.mockReturnValue("https://app.example.com");
    mockGetEmailWorkerSecret.mockReturnValue("worker-secret");
  });

  it("no-ops (returns false) when the worker secret is not configured", async () => {
    mockGetEmailWorkerSecret.mockReturnValue(undefined);
    const { triggerEmailWorker } = await import("./worker-trigger");
    await expect(triggerEmailWorker("send-1")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the worker with a bounded AbortSignal and returns true", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const { triggerEmailWorker } = await import("./worker-trigger");
    await expect(triggerEmailWorker("send-1")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.example.com/api/admin/email/process",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("logs loudly and rethrows when the trigger fails (never silently swallowed)", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("aborted"));
    const { triggerEmailWorker } = await import("./worker-trigger");

    await expect(triggerEmailWorker("send-7")).rejects.toThrow("aborted");
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to trigger worker for send send-7"),
      "aborted",
    );
    consoleError.mockRestore();
  });
});
