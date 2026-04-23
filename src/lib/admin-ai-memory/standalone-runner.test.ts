import { describe, expect, it } from "vitest";

describe("standalone backfill runner", () => {
  it("can be imported", async () => {
    const mod = await import("../../../scripts/admin-ai-memory/_runner.ts");

    expect(typeof mod.runStandaloneBackfill).toBe("function");
  });
});
