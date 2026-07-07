import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAdmin = vi.fn();
const mockGetMediaUrl = vi.fn();
const mockGetArchivedMedia = vi.fn();
const mockCreateSignedUrl = vi.fn();

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/data/conversations", () => ({
  getConversationMessageMediaUrl: mockGetMediaUrl,
  getArchivedConversationMedia: mockGetArchivedMedia,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockResolvedValue({
    storage: {
      from: vi.fn(() => ({ createSignedUrl: mockCreateSignedUrl })),
    },
  }),
}));

const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const YCLOUD_URL = "https://api.ycloud.com/v2/whatsapp/media/download/abc";
const SIGNED_URL =
  "https://project.supabase.co/storage/v1/object/sign/whatsapp-media/messages/x/0.jpg?token=t";

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
    // Default: attachment not seeded into the archive yet -> passthrough.
    mockGetArchivedMedia.mockResolvedValue(null);
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: SIGNED_URL },
      error: null,
    });
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

  it("redirects to a signed URL when the attachment is archived", async () => {
    mockGetArchivedMedia.mockResolvedValue({
      status: "stored",
      storagePath: "messages/x/0.jpg",
      contentType: "image/jpeg",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await get(`messageId=${MESSAGE_ID}&index=0`);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(SIGNED_URL);
    // Archived media never touches YCloud (works after the 30-day purge).
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("messages/x/0.jpg", 600);
  });

  it("serves archived media even without YCLOUD_API_KEY", async () => {
    delete process.env.YCLOUD_API_KEY;
    mockGetArchivedMedia.mockResolvedValue({
      status: "stored",
      storagePath: "messages/x/0.jpg",
      contentType: "image/jpeg",
    });
    const res = await get(`messageId=${MESSAGE_ID}&index=0`);
    expect(res.status).toBe(302);
  });

  it("502s loudly when a stored attachment cannot be signed", async () => {
    mockGetArchivedMedia.mockResolvedValue({
      status: "stored",
      storagePath: "messages/x/0.jpg",
      contentType: "image/jpeg",
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "object not found" },
    });
    const res = await get(`messageId=${MESSAGE_ID}&index=0`);
    expect(res.status).toBe(502);
  });

  it("410s for media that expired upstream before archiving", async () => {
    mockGetArchivedMedia.mockResolvedValue({
      status: "expired",
      storagePath: null,
      contentType: null,
    });
    const res = await get(`messageId=${MESSAGE_ID}&index=0`);
    expect(res.status).toBe(410);
  });

  it("falls back to the YCloud passthrough while the archive is pending", async () => {
    mockGetArchivedMedia.mockResolvedValue({
      status: "pending",
      storagePath: null,
      contentType: "image/jpeg",
    });
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

  it("504s when the initial upstream fetch times out (bounded, not left hanging)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aborted")));
    const res = await get(`messageId=${MESSAGE_ID}&index=0`);
    expect(res.status).toBe(504);
  });
});
