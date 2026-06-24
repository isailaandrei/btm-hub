import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthorize = vi.fn();
const mockReconcile = vi.fn();

vi.mock("@/lib/cron-auth", () => ({ authorizeCronRequest: mockAuthorize }));
vi.mock("@/lib/data/email-sends", () => ({
  reconcileOrphanEmailEvents: mockReconcile,
}));

describe("email-reconcile cron", () => {
  beforeEach(() => {
    mockAuthorize.mockReset();
    mockReconcile.mockReset();
  });

  it("reconciles orphan events when authorized", async () => {
    mockAuthorize.mockReturnValue(null);
    mockReconcile.mockResolvedValue(3);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://x/api/cron/email-reconcile"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reconciled: 3 });
    expect(mockReconcile).toHaveBeenCalledOnce();
  });

  it("short-circuits and does no work when unauthorized", async () => {
    mockAuthorize.mockReturnValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const { GET } = await import("./route");
    const res = await GET(new Request("http://x/api/cron/email-reconcile"));
    expect(res.status).toBe(401);
    expect(mockReconcile).not.toHaveBeenCalled();
  });
});
