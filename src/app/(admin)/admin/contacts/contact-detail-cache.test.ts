import { describe, expect, it, vi } from "vitest";
import type { ContactDetailBootstrapData } from "@/lib/data/contact-detail";
import { createContactDetailCacheStore } from "./contact-detail-cache";

function makeData(name: string): ContactDetailBootstrapData {
  return {
    applications: [],
    contact: { id: "c1", name } as ContactDetailBootstrapData["contact"],
    events: [],
    hasMore: false,
    nextCursor: null,
  };
}

const ID_A = "a0000000-0000-0000-0000-000000000000";
const ID_B = "b0000000-0000-0000-0000-000000000000";

describe("contactDetailCacheStore", () => {
  it("stores and reads fresh entries", () => {
    const store = createContactDetailCacheStore();
    expect(store.has(ID_A)).toBe(false);
    expect(store.get(ID_A)).toBeUndefined();

    store.set(ID_A, makeData("Ada"));

    const entry = store.get(ID_A);
    expect(store.has(ID_A)).toBe(true);
    expect(entry?.status).toBe("fresh");
    expect(entry?.data.contact.name).toBe("Ada");
  });

  it("markStale keeps data but flips status and notifies", () => {
    const store = createContactDetailCacheStore();
    store.set(ID_A, makeData("Ada"));
    const listener = vi.fn();
    store.subscribe(ID_A, listener);

    store.markStale(ID_A);

    expect(store.get(ID_A)?.status).toBe("stale");
    expect(store.get(ID_A)?.data.contact.name).toBe("Ada");
    expect(listener).toHaveBeenCalledTimes(1);

    // No-op when already stale.
    store.markStale(ID_A);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("markStale on a missing entry is a no-op", () => {
    const store = createContactDetailCacheStore();
    const listener = vi.fn();
    store.subscribe(ID_A, listener);
    store.markStale(ID_A);
    expect(store.get(ID_A)).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies subscribers on set and stops after unsubscribe", () => {
    const store = createContactDetailCacheStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(ID_A, listener);

    store.set(ID_A, makeData("Ada"));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.set(ID_A, makeData("Grace"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not leak notifications across contact ids", () => {
    const store = createContactDetailCacheStore();
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    store.subscribe(ID_A, listenerA);
    store.subscribe(ID_B, listenerB);

    store.set(ID_A, makeData("Ada"));

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).not.toHaveBeenCalled();
  });

  it("last-write-wins by loadedAt (older write is ignored)", () => {
    const store = createContactDetailCacheStore();
    store.set(ID_A, makeData("Newer"), 2000);
    store.set(ID_A, makeData("Older"), 1000);

    expect(store.get(ID_A)?.data.contact.name).toBe("Newer");

    // Equal or newer overwrites.
    store.set(ID_A, makeData("Equal"), 2000);
    expect(store.get(ID_A)?.data.contact.name).toBe("Equal");
  });

  it("clear drops entries", () => {
    const store = createContactDetailCacheStore();
    store.set(ID_A, makeData("Ada"));
    store.clear();
    expect(store.has(ID_A)).toBe(false);
  });
});
