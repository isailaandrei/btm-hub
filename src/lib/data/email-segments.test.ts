import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { normalizeSegmentRule } = await import("./email-segments");

describe("normalizeSegmentRule", () => {
  it("defaults to a well-formed 'all' rule for junk input", () => {
    expect(normalizeSegmentRule(null)).toEqual({
      match: "all",
      includeTagIds: [],
      excludeTagIds: [],
    });
    expect(normalizeSegmentRule("nope")).toEqual({
      match: "all",
      includeTagIds: [],
      excludeTagIds: [],
    });
  });

  it("preserves includes, coerces match, and drops legacy excludes (include-only)", () => {
    expect(
      normalizeSegmentRule({
        match: "any",
        includeTagIds: ["a", "b"],
        excludeTagIds: ["c"],
      }),
    ).toEqual({ match: "any", includeTagIds: ["a", "b"], excludeTagIds: [] });
    expect(normalizeSegmentRule({ match: "weird" }).match).toBe("all");
  });

  it("filters non-string ids", () => {
    expect(
      normalizeSegmentRule({ includeTagIds: ["a", 1, null, "b"] }).includeTagIds,
    ).toEqual(["a", "b"]);
  });
});
