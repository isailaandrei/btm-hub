import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("admin AI debug logging", () => {
  const originalDebug = process.env.DEBUG_ADMIN_AI;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete process.env.DEBUG_ADMIN_AI;
  });

  afterEach(() => {
    if (originalDebug === undefined) {
      delete process.env.DEBUG_ADMIN_AI;
      return;
    }
    process.env.DEBUG_ADMIN_AI = originalDebug;
  });

  it("is disabled by default", async () => {
    const debug = await import("./debug");
    expect(debug.isAdminAiDebugEnabled()).toBe(false);
  });

  it("treats truthy env values as enabled", async () => {
    process.env.DEBUG_ADMIN_AI = "true";
    const debug = await import("./debug");
    expect(debug.isAdminAiDebugEnabled()).toBe(true);
  });

  it("logs structured payloads only when enabled", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    process.env.DEBUG_ADMIN_AI = "1";
    const debug = await import("./debug");

    debug.adminAiDebugLog("cohort", { candidateCount: 12 });

    expect(infoSpy).toHaveBeenCalledWith(
      "[admin-ai][debug] cohort",
      { candidateCount: 12 },
    );
  });

  it("does not log when disabled", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const debug = await import("./debug");

    debug.adminAiDebugLog("cohort", { candidateCount: 12 });

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("logs timed events with a duration in milliseconds", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(1_275);
    process.env.DEBUG_ADMIN_AI = "yes";
    const debug = await import("./debug");

    debug.startAdminAiDebugTimer("global-single-pass", { scope: "global" }).end({
      shortlistCount: 4,
    });

    expect(infoSpy).toHaveBeenCalledWith(
      "[admin-ai][debug] global-single-pass",
      expect.objectContaining({
        scope: "global",
        shortlistCount: 4,
        durationMs: 275,
      }),
    );
  });
});
