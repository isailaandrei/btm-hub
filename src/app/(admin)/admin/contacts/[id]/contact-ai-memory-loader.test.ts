import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLoadContactAiMemory = vi.fn();

vi.mock("../actions", () => ({
  loadContactAiMemory: mockLoadContactAiMemory,
}));

const {
  loadContactAiMemoryShared,
  invalidateContactAiMemoryShared,
  subscribeContactAiMemory,
} = await import("./contact-ai-memory-loader");

const CONTACT_A = "contact-a";
const CONTACT_B = "contact-b";

function memory() {
  return { digests: [], facts: [], freshnessDays: 45, eventGraceDays: 14 };
}

describe("contact-ai-memory-loader subscriptions", () => {
  beforeEach(() => {
    mockLoadContactAiMemory.mockReset().mockResolvedValue(memory());
  });

  afterEach(() => {
    // Evict so the module-level cache can't leak a resolved promise between tests.
    invalidateContactAiMemoryShared(CONTACT_A);
    invalidateContactAiMemoryShared(CONTACT_B);
  });

  it("notifies a contact's subscribers on invalidate", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeContactAiMemory(CONTACT_A, listener);

    invalidateContactAiMemoryShared(CONTACT_A);
    expect(listener).toHaveBeenCalledTimes(1);

    invalidateContactAiMemoryShared(CONTACT_A);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("stops notifying after unsubscribe (a later notify is a no-op)", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeContactAiMemory(CONTACT_A, listener);
    unsubscribe();

    invalidateContactAiMemoryShared(CONTACT_A);
    expect(listener).not.toHaveBeenCalled();
  });

  it("scopes notifications per contact", () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubA = subscribeContactAiMemory(CONTACT_A, listenerA);
    const unsubB = subscribeContactAiMemory(CONTACT_B, listenerB);

    invalidateContactAiMemoryShared(CONTACT_A);
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).not.toHaveBeenCalled();

    unsubA();
    unsubB();
  });

  it("evicts the cache on invalidate so the next load re-fetches", async () => {
    await loadContactAiMemoryShared(CONTACT_A);
    await loadContactAiMemoryShared(CONTACT_A);
    // Second call within TTL is served from cache — no second fetch.
    expect(mockLoadContactAiMemory).toHaveBeenCalledTimes(1);

    invalidateContactAiMemoryShared(CONTACT_A);
    await loadContactAiMemoryShared(CONTACT_A);
    // Eviction forced a fresh fetch.
    expect(mockLoadContactAiMemory).toHaveBeenCalledTimes(2);
  });

  it("does not throw when invalidating a contact with no subscribers", () => {
    expect(() => invalidateContactAiMemoryShared("nobody")).not.toThrow();
  });
});
