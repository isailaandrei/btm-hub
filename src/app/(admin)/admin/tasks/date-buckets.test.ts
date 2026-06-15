import { describe, expect, it } from "vitest";
import { getTaskDateBucket } from "./date-buckets";

describe("getTaskDateBucket", () => {
  const today = "2026-05-21";

  it.each([
    [null, "without_date"],
    ["2026-05-20", "past"],
    ["2026-05-21", "today"],
    ["2026-05-22", "tomorrow"],
    ["2026-05-24", "this_week"],
    ["2026-05-25", "next_week"],
    ["2026-05-31", "next_week"],
    ["2026-06-01", "later"],
  ] as const)("maps %s to %s", (dueDate, bucket) => {
    expect(getTaskDateBucket(dueDate, today)).toBe(bucket);
  });
});
