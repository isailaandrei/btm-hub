import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAdmin = vi.fn();
const mockGetMediaUrl = vi.fn();

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/data/conversations", () => ({
  getConversationMessageMediaUrl: mockGetMediaUrl,
}));

const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const YCLOUD_URL = "https://api.ycloud.com/v2/whatsapp/media/download/abc";

async function get(params: string) {
  const { GET } = await import("./route");
  return GET(
    new Request(`https://example.com/api/whatsapp/ycloud/media?${params}`),
  );
}

describe("GET /api/whatsapp/ycloud/media", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockRequireAdmin.mockResolvedValue({ id: "admin-1", role: "admin" });
    mockGetMediaUrl.mockResolvedValue(YCLOUD_URL);
    process.env.YCLOUD_API_KEY = "key-123";
  });

  it("rejects an invalid messageId", async () => {
    const res = await get("messageId=not-a-uuid&index=0");
    expect(res.status).toBe(400);
  });

  it("returns 503 when YCLOUD_API_KEY is not configured", async () => {
    delete process.env.YCLOUD_API_KEY;
    const res = await get(`messageId=${MESSAGE_ID}&index=0`);
    expect(res.status).toBe(503);
  });

  it("404s when the media attachment is not found", async () => {
    mockGetMediaUrl.mockResolvedValue(null);
    const res = await get(`messageId=${MESSAGE_ID}&index=0`);
    expect(res.status).toBe(404);
  });

  it("refuses to proxy a non-YCloud URL (SSRF guard)", async () => {
    mockGetMediaUrl.mockResolvedValue("https://evil.example.com/secret");
    const res = await get(`messageId=${MESSAGE_ID}&index=0`);
    expect(res.status).toBe(400);
  });

  it("streams YCloud media with the API key and passes the content-type through", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("bytes", {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await get(`messageId=${MESSAGE_ID}&index=0`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(fetchMock).toHaveBeenCalledWith(
      YCLOUD_URL,
      expect.objectContaining({ headers: { "X-API-Key": "key-123" } }),
    );
  });

  it("502s when the upstream media fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 410 })),
    );
    const res = await get(`messageId=${MESSAGE_ID}&index=0`);
    expect(res.status).toBe(502);
  });
});
