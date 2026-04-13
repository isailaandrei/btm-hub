import { describe, expect, it } from "vitest";
import { pruneSelectedIds } from "./selection-helpers";

describe("pruneSelectedIds", () => {
  it("returns the same Set instance when all selected IDs are still valid", () => {
    const selected = new Set(["a", "b"]);
    const valid = new Set(["a", "b", "c"]);

    const result = pruneSelectedIds(selected, valid);

    expect(result).toBe(selected);
  });

  it("removes IDs that no longer exist in the backing dataset", () => {
    const selected = new Set(["a", "b", "c"]);
    const valid = new Set(["a", "c"]);

    const result = pruneSelectedIds(selected, valid);

    expect([...result]).toEqual(["a", "c"]);
  });

  it("returns an empty Set when every selected ID is stale", () => {
    const selected = new Set(["a", "b"]);
    const valid = new Set<string>();

    const result = pruneSelectedIds(selected, valid);

    expect([...result]).toEqual([]);
  });
});
