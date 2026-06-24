import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthorize = vi.fn();
const mockNeeding = vi.fn();
const mockProcess = vi.fn();
const mockGetProvider = vi.fn();
const mockTrigger = vi.fn();

vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/cron-auth", () => ({ authorizeCronRequest: mockAuthorize }));
vi.mock("@/lib/data/email-sends", () => ({
  getEmailSendsNeedingProcessing: mockNeeding,
}));
vi.mock("@/lib/email/provider", () => ({ getEmailProvider: mockGetProvider }));
vi.mock("@/lib/email/send-pipeline", () => ({
  processEmailSendChunks: mockProcess,
}));
vi.mock("@/lib/email/worker-trigger", () => ({ triggerEmailWorker: mockTrigger }));

describe("email-drain cron", () => {
  beforeEach(() => {
    mockAuthorize.mockReset().mockReturnValue(null);
    mockNeeding.mockReset();
    mockProcess.mockReset();
    mockGetProvider.mockReset().mockReturnValue({});
    mockTrigger.mockReset().mockResolvedValue(true);
  });

  it("processes every send that needs work", async () => {
    mockNeeding.mockResolvedValue(["send-a", "send-b"]);
    mockProcess.mockResolvedValue({ processed: 5, hasMore: false });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://x/api/cron/email-drain"));
    expect(res.status).toBe(200);
    expect(mockProcess).toHaveBeenCalledTimes(2);
    expect(mockProcess).toHaveBeenCalledWith(
      expect.objectContaining({ sendId: "send-a" }),
    );
  });

  it("no-ops when nothing needs processing", async () => {
    mockNeeding.mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://x/api/cron/email-drain"));
    expect(await res.json()).toEqual({ ok: true, sends: [] });
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("short-circuits when unauthorized", async () => {
    mockAuthorize.mockReturnValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const { GET } = await import("./route");
    const res = await GET(new Request("http://x/api/cron/email-drain"));
    expect(res.status).toBe(401);
    expect(mockNeeding).not.toHaveBeenCalled();
  });
});
