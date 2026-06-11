import { beforeEach, describe, expect, it, vi } from "vitest";

const mockProcessConversationDigestWindows = vi.fn();

vi.mock("@/lib/conversations/digests", () => ({
  processConversationDigestWindows: mockProcessConversationDigestWindows,
}));

describe("GET /api/cron/conversation-digest", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mockProcessConversationDigestWindows.mockResolvedValue({
      processedWindows: 0,
      digestsCreated: 0,
      factsCreated: 0,
      embeddingsCreated: 0,
    });
  });

  it("rejects invalid cron secrets", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/conversation-digest", {
        headers: { authorization: "Bearer wrong" },
      }),
    );

    expect(response.status).toBe(401);
    expect(mockProcessConversationDigestWindows).not.toHaveBeenCalled();
  });

  it("runs the digest worker for authorized requests", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/conversation-digest", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      summary: {
        processedWindows: 0,
        digestsCreated: 0,
        factsCreated: 0,
        embeddingsCreated: 0,
      },
    });
    expect(mockProcessConversationDigestWindows).toHaveBeenCalledTimes(1);
  });
});
