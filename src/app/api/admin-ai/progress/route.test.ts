import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAdmin = vi.fn();
const mockReadAdminAiProgress = vi.fn();

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/admin-ai/progress", () => ({
  readAdminAiProgress: mockReadAdminAiProgress,
}));

const PROGRESS_ID = "22222222-2222-4222-8222-222222222222";

async function get(params: string) {
  const { GET } = await import("./route");
  return GET(new Request(`https://example.com/api/admin-ai/progress?${params}`));
}

describe("GET /api/admin-ai/progress", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ id: "admin-1", role: "admin" });
    mockReadAdminAiProgress.mockResolvedValue(null);
  });

  it("rejects a malformed progress id", async () => {
    const res = await get("id=not-a-uuid");
    expect(res.status).toBe(400);
    expect(mockReadAdminAiProgress).not.toHaveBeenCalled();
  });

  it("returns the snapshot (null before the first write)", async () => {
    const res = await get(`id=${PROGRESS_ID}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ snapshot: null });
  });

  it("returns a written snapshot", async () => {
    mockReadAdminAiProgress.mockResolvedValue({
      stage: "scanning",
      chunksDone: 3,
      chunkTotal: 11,
      candidateCount: 9,
      updatedAt: "2026-07-08T00:00:00.000Z",
    });
    const res = await get(`id=${PROGRESS_ID}`);
    const body = await res.json();
    expect(body.snapshot.stage).toBe("scanning");
    expect(mockReadAdminAiProgress).toHaveBeenCalledWith(PROGRESS_ID);
  });
});
