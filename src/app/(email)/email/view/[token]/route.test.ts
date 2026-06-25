import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetByToken } = vi.hoisted(() => ({ mockGetByToken: vi.fn() }));
vi.mock("@/lib/data/email-sends", () => ({
  getEmailSendByPublicToken: mockGetByToken,
}));

import { GET } from "./route";

const request = () => new Request("https://btm.test/email/view/tok");
const params = (token: string) => ({ params: Promise.resolve({ token }) });

const validSend = {
  builder_json_snapshot: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { textAlign: "left" },
        content: [{ type: "text", text: "Hello from the web version" }],
      },
    ],
  },
  preview_text: "",
  from_name: "Behind The Mask",
  from_email: "hello@behind-the-mask.com",
  reply_to_email: "hello@behind-the-mask.com",
};

describe("GET /email/view/[token]", () => {
  beforeEach(() => mockGetByToken.mockReset());

  it("renders the email HTML for a valid token", async () => {
    mockGetByToken.mockResolvedValue(validSend);
    const res = await GET(request(), params("good"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const html = await res.text();
    expect(html).toContain("Hello from the web version");
    expect(mockGetByToken).toHaveBeenCalledWith("good");
  });

  it("returns 404 for an unknown token", async () => {
    mockGetByToken.mockResolvedValue(null);
    const res = await GET(request(), params("missing"));
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("isn't available");
  });

  it("returns 404 when the snapshot isn't a valid Maily document", async () => {
    mockGetByToken.mockResolvedValue({ ...validSend, builder_json_snapshot: { nope: true } });
    const res = await GET(request(), params("broken"));
    expect(res.status).toBe(404);
  });
});
