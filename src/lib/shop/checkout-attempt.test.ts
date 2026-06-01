/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("checkout attempt storage", () => {
  beforeEach(() => {
    vi.resetModules();
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
    });
  });

  it("reuses an attempt id for the same cart until the attempt is cleared", async () => {
    const { checkoutAttemptIdForCart, clearCheckoutAttemptId } = await import(
      "./checkout-attempt"
    );
    const lines = [{ variantId: "00000000-0000-4000-8000-000000000101", quantity: 1 }];

    const first = checkoutAttemptIdForCart(lines);
    const second = checkoutAttemptIdForCart(lines);
    clearCheckoutAttemptId();
    const third = checkoutAttemptIdForCart(lines);

    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });
});
