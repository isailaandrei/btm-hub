import { describe, expect, it } from "vitest";
import { formatDate } from "./format-date";

describe("formatDate", () => {
  it("formats a mid-day timestamp", () => {
    expect(formatDate("2026-07-12T10:00:00.000Z")).toBe("12 Jul 2026");
  });

  it("stays on the UTC date for late-evening timestamps regardless of machine timezone", () => {
    // In any TZ east of UTC (e.g. Europe/Bucharest, UTC+3) an unpinned
    // toLocaleDateString would render this as 13 Jul and diverge from the
    // server's 12 Jul, causing a hydration text mismatch.
    expect(formatDate("2026-07-12T23:30:00.000Z")).toBe("12 Jul 2026");
  });

  it("passes invalid input through unchanged", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});
