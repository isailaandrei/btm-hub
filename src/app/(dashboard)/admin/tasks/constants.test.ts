import { describe, expect, it } from "vitest";
import { TASK_GROUP_COLOR_META, TASK_STATUS_META } from "./constants";

describe("task status metadata", () => {
  it("uses blue for working on it and yellow for waiting", () => {
    expect(TASK_STATUS_META.working_on_it.className).toContain("bg-blue");
    expect(TASK_STATUS_META.waiting.className).toContain("bg-yellow");
  });
});

describe("task group color metadata", () => {
  it("exposes explicit static marker and border classes for visible group colors", () => {
    expect(TASK_GROUP_COLOR_META.teal.markerClassName).toBe("bg-teal-500");
    expect(TASK_GROUP_COLOR_META.teal.borderClassName).toBe("border-l-teal-500");
  });
});
