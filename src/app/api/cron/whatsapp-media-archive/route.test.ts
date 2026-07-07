import { beforeEach, describe, expect, it, vi } from "vitest";

const mockArchiveConversationMediaBatch = vi.fn();

vi.mock("@/lib/conversations/media-archive", () => ({
  archiveConversationMediaBatch: mockArchiveConversationMediaBatch,
  DEFAULT_MAX_MEDIA_PER_RUN: 40,
}));

const SUMMARY = {
  seeded: 0,
  processed: 0,
  stored: 0,
  expired: 0,
  failed: 0,
  retriable: 0,
  remaining: 0,
};

describe("GET /api/cron/whatsapp-media-archive", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mockArchiveConversationMediaBatch.mockResolvedValue(SUMMARY);
  });

  it("rejects invalid cron secrets", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/whatsapp-media-archive", {
        headers: { authorization: "Bearer wrong" },
      }),
    );

    expect(response.status).toBe(401);
    expect(mockArchiveConversationMediaBatch).not.toHaveBeenCalled();
  });

  it("fails loud when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/whatsapp-media-archive"),
    );

    expect(response.status).toBe(500);
    expect(mockArchiveConversationMediaBatch).not.toHaveBeenCalled();
  });

  it("runs a bounded archive batch for authorized requests", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/whatsapp-media-archive", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      summary: SUMMARY,
    });
    expect(mockArchiveConversationMediaBatch).toHaveBeenCalledWith({
      maxItems: 40,
    });
  });
});
