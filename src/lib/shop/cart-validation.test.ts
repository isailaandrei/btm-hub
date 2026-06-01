import { describe, expect, it } from "vitest";
import {
  cartCheckoutInputSchema,
  cartFingerprint,
  normalizeCartLines,
} from "./cart-validation";
import {
  LEGACY_MOCK_SHOP_VARIANT_HOODIE_M_ID,
  MOCK_SHOP_VARIANT_HOODIE_M_ID,
} from "./mock-product-ids";

const VARIANT_A_ID = "00000000-0000-4000-8000-0000000000a1";
const VARIANT_B_ID = "00000000-0000-4000-8000-0000000000b1";

describe("shop cart validation", () => {
  it("merges duplicate variants and sorts the checkout payload", () => {
    expect(
      normalizeCartLines([
        { variantId: VARIANT_B_ID, quantity: 1 },
        { variantId: VARIANT_A_ID, quantity: 2 },
        { variantId: VARIANT_B_ID, quantity: 3 },
      ]),
    ).toEqual([
      { variantId: VARIANT_A_ID, quantity: 2 },
      { variantId: VARIANT_B_ID, quantity: 4 },
    ]);
  });

  it("rejects empty carts at checkout boundaries", () => {
    const result = cartCheckoutInputSchema.safeParse({
      checkoutAttemptId: "attempt-1",
      lines: [],
    });

    expect(result.success).toBe(false);
  });

  it("builds a stable cart fingerprint", () => {
    expect(
      cartFingerprint([
        { variantId: VARIANT_B_ID, quantity: 1 },
        { variantId: VARIANT_A_ID, quantity: 1 },
      ]),
    ).toBe(
      JSON.stringify([
        { variantId: VARIANT_A_ID, quantity: 1 },
        { variantId: VARIANT_B_ID, quantity: 1 },
      ]),
    );
  });

  it("normalizes legacy mock variant ids before checkout", () => {
    expect(
      normalizeCartLines([
        { variantId: LEGACY_MOCK_SHOP_VARIANT_HOODIE_M_ID, quantity: 1 },
      ]),
    ).toEqual([{ variantId: MOCK_SHOP_VARIANT_HOODIE_M_ID, quantity: 1 }]);
  });

  it("rejects non-UUID non-mock variant ids before the database RPC", () => {
    const result = cartCheckoutInputSchema.safeParse({
      checkoutAttemptId: "attempt-1",
      lines: [{ variantId: "variant-a", quantity: 1 }],
    });

    expect(result.success).toBe(false);
  });
});
