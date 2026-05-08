import { describe, expect, it, vi } from "vitest";

const mockCreateShopProduct = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/data/shop-admin", () => ({
  createShopProduct: mockCreateShopProduct,
}));

const { createShopProductAction } = await import("./actions");

describe("shop admin actions", () => {
  it("returns validation errors for missing title", async () => {
    const result = await createShopProductAction({
      title: "",
      slug: "mask-tee",
      type: "physical",
      visibility: "members",
      purchaseAccess: "members",
      shortDescription: "",
    });

    expect(result.errors.title).toBeDefined();
    expect(mockCreateShopProduct).not.toHaveBeenCalled();
  });

  it("creates a product and revalidates admin and shop pages", async () => {
    mockCreateShopProduct.mockResolvedValue({ id: "product-1" });

    const result = await createShopProductAction({
      title: "Mask Tee",
      slug: "mask-tee",
      type: "physical",
      visibility: "members",
      purchaseAccess: "members",
      shortDescription: "BTM shirt",
    });

    expect(result).toEqual({
      productId: "product-1",
      errors: {},
      message: "Product created.",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/shop");
  });
});
