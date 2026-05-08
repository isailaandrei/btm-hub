import { describe, expect, it } from "vitest";
import type { ShopProduct } from "@/types/database";
import { canPurchaseProduct, canViewProduct } from "./visibility";

const baseProduct: ShopProduct = {
  id: "product-1",
  title: "Mask Tee",
  slug: "mask-tee",
  type: "physical",
  status: "active",
  visibility: "public",
  purchase_access: "members",
  short_description: "",
  content_blocks: [],
  stripe_tax_code: null,
  tax_behavior: "exclusive",
  requires_shipping: true,
  requires_customer_notes: false,
  customer_notes_label: "Anything we should know?",
  sort_order: 0,
  created_at: "2026-05-08T00:00:00.000Z",
  updated_at: "2026-05-08T00:00:00.000Z",
};

describe("shop visibility", () => {
  it("allows public users to view public active products but not buy member products", () => {
    expect(canViewProduct(baseProduct, null)).toBe(true);
    expect(canPurchaseProduct(baseProduct, null)).toBe(false);
  });

  it("allows members to view and buy member-access products", () => {
    expect(canPurchaseProduct(baseProduct, { id: "profile-1", role: "member" })).toBe(true);
  });

  it("keeps public-access products member-checkout only at launch", () => {
    expect(canPurchaseProduct({ ...baseProduct, purchase_access: "public" }, null)).toBe(false);
    expect(canPurchaseProduct({ ...baseProduct, purchase_access: "public" }, { id: "profile-1", role: "member" })).toBe(true);
  });

  it("hides member products from public users", () => {
    expect(canViewProduct({ ...baseProduct, visibility: "members" }, null)).toBe(false);
  });

  it("hides draft and hidden products from non-admins", () => {
    expect(canViewProduct({ ...baseProduct, status: "draft" }, { id: "p1", role: "member" })).toBe(false);
    expect(canViewProduct({ ...baseProduct, visibility: "hidden" }, { id: "p1", role: "member" })).toBe(false);
  });

  it("does not allow hidden products to be purchased by members through stale carts", () => {
    expect(canPurchaseProduct({ ...baseProduct, visibility: "hidden" }, { id: "p1", role: "member" })).toBe(false);
  });

  it("allows admins to view draft and hidden products", () => {
    expect(canViewProduct({ ...baseProduct, status: "draft", visibility: "hidden" }, { id: "admin", role: "admin" })).toBe(true);
  });
});
