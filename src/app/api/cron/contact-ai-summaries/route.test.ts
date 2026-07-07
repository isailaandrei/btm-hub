import { beforeEach, describe, expect, it, vi } from "vitest";

const mockProcessContactAiSummaries = vi.fn();

vi.mock("@/lib/admin-ai/contact-summary", () => ({
  processContactAiSummaries: mockProcessContactAiSummaries,
  DEFAULT_MAX_SUMMARIES_PER_RUN: 20,
}));

const SUMMARY = { eligible: 0, stale: 0, generated: 0, failed: 0, remaining: 0 };

describe("GET /api/cron/contact-ai-summaries", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mockProcessContactAiSummaries.mockResolvedValue(SUMMARY);
  });

  it("rejects invalid cron secrets", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/contact-ai-summaries", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(response.status).toBe(401);
    expect(mockProcessContactAiSummaries).not.toHaveBeenCalled();
  });

  it("fails loud when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/contact-ai-summaries"),
    );
    expect(response.status).toBe(500);
    expect(mockProcessContactAiSummaries).not.toHaveBeenCalled();
  });

  it("runs a bounded summary batch for authorized requests", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/cron/contact-ai-summaries", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, summary: SUMMARY });
    expect(mockProcessContactAiSummaries).toHaveBeenCalledWith({
      maxContacts: 20,
    });
  });
});
