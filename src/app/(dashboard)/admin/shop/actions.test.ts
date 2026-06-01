import { describe, expect, it, vi } from "vitest";

const mockCreateShopProduct = vi.fn();
const mockUpdateShopProduct = vi.fn();
const mockCreateShopVariant = vi.fn();
const mockUpdateShopVariant = vi.fn();
const mockListAdminShopProducts = vi.fn();
const mockListAdminShippingZones = vi.fn();
const mockListAdminShopOrders = vi.fn();
const mockRecordShopProductMedia = vi.fn();
const mockDeleteShopProductMedia = vi.fn();
const mockUpdateShopProductContent = vi.fn();
const mockUpsertShippingZone = vi.fn();
const mockUpsertShippingRate = vi.fn();
const mockUpdateOrderFulfillment = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/data/shop-admin", () => ({
  createShopProduct: mockCreateShopProduct,
  updateShopProduct: mockUpdateShopProduct,
  createShopVariant: mockCreateShopVariant,
  updateShopVariant: mockUpdateShopVariant,
  listAdminShopProducts: mockListAdminShopProducts,
  listAdminShippingZones: mockListAdminShippingZones,
  listAdminShopOrders: mockListAdminShopOrders,
  recordShopProductMedia: mockRecordShopProductMedia,
  deleteShopProductMedia: mockDeleteShopProductMedia,
  updateShopProductContent: mockUpdateShopProductContent,
  upsertShippingZone: mockUpsertShippingZone,
  upsertShippingRate: mockUpsertShippingRate,
  updateOrderFulfillment: mockUpdateOrderFulfillment,
}));

const {
  createShopProductAction,
  createShopProductFormAction,
  createShopVariantFormAction,
  loadShopAdminDataAction,
  loadShopOrdersAction,
  loadShopShippingDataAction,
  recordShopProductMediaAction,
  saveShippingZoneRateFormAction,
  updateOrderFulfillmentFormAction,
  updateShopProductContentFormAction,
  updateShopProductFormAction,
  updateShopVariantFormAction,
} = await import("./actions");

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

  it("loads shop admin catalog data", async () => {
    mockListAdminShopProducts.mockResolvedValue([{ id: "product-1" }]);

    await expect(loadShopAdminDataAction()).resolves.toEqual({
      products: [{ id: "product-1" }],
    });
  });

  it("loads shipping and order admin data", async () => {
    mockListAdminShippingZones.mockResolvedValue([{ id: "zone-1" }]);
    mockListAdminShopOrders.mockResolvedValue([{ id: "order-1" }]);

    await expect(loadShopShippingDataAction()).resolves.toEqual({
      zones: [{ id: "zone-1" }],
    });
    await expect(loadShopOrdersAction({ status: "paid" })).resolves.toEqual({
      orders: [{ id: "order-1" }],
    });
  });

  it("creates products from admin form data", async () => {
    mockCreateShopProduct.mockResolvedValue({ id: "product-2" });
    const formData = new FormData();
    formData.set("title", "Mask Tee");
    formData.set("slug", "mask-tee");
    formData.set("type", "physical");
    formData.set("visibility", "members");
    formData.set("purchaseAccess", "members");
    formData.set("shortDescription", "BTM shirt");

    const result = await createShopProductFormAction(
      { errors: null, message: null, success: false, resetKey: 0 },
      formData,
    );

    expect(result).toMatchObject({
      productId: "product-2",
      success: true,
      message: "Product created.",
    });
  });

  it("updates products from admin form data", async () => {
    mockUpdateShopProduct.mockResolvedValue({ id: "product-1" });
    const formData = new FormData();
    formData.set("productId", "product-1");
    formData.set("title", "Mask Tee");
    formData.set("slug", "mask-tee");
    formData.set("status", "active");
    formData.set("type", "physical");
    formData.set("visibility", "public");
    formData.set("purchaseAccess", "members");
    formData.set("shortDescription", "BTM shirt");
    formData.set("customerNotesLabel", "Order notes");

    const result = await updateShopProductFormAction(
      { errors: null, message: null, success: false, resetKey: 0 },
      formData,
    );

    expect(mockUpdateShopProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "product-1",
        status: "active",
        visibility: "public",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("creates variants with parsed EUR cents", async () => {
    mockCreateShopVariant.mockResolvedValue({ id: "variant-1" });
    const formData = new FormData();
    formData.set("productId", "product-1");
    formData.set("title", "Black / M");
    formData.set("sku", "BTM-HOODIE-M");
    formData.set("price", "79.00");
    formData.set("stockQuantity", "12");
    formData.set("lowStockThreshold", "3");
    formData.set("sortOrder", "0");
    formData.set("trackInventory", "on");
    formData.set("active", "on");

    const result = await createShopVariantFormAction(
      { errors: null, message: null, success: false, resetKey: 0 },
      formData,
    );

    expect(mockCreateShopVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "product-1",
        priceCents: 7900,
        stockQuantity: 12,
      }),
    );
    expect(result.success).toBe(true);
  });

  it("updates variants with parsed EUR cents", async () => {
    mockUpdateShopVariant.mockResolvedValue({ id: "variant-1" });
    const formData = new FormData();
    formData.set("variantId", "variant-1");
    formData.set("title", "Black / L");
    formData.set("sku", "BTM-HOODIE-L");
    formData.set("price", "84.50");
    formData.set("stockQuantity", "7");
    formData.set("lowStockThreshold", "2");
    formData.set("sortOrder", "1");
    formData.set("trackInventory", "on");
    formData.set("active", "on");

    const result = await updateShopVariantFormAction(
      { errors: null, message: null, success: false, resetKey: 0 },
      formData,
    );

    expect(mockUpdateShopVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        variantId: "variant-1",
        priceCents: 8450,
        stockQuantity: 7,
      }),
    );
    expect(result.success).toBe(true);
  });

  it("records product media metadata after upload", async () => {
    mockRecordShopProductMedia.mockResolvedValue({ id: "media-1" });

    const result = await recordShopProductMediaAction({
      productId: "product-1",
      storagePath: "product-1/image.png",
      publicUrl: "https://example.com/image.png",
      altText: "Mask Tee",
      caption: "",
      mimeType: "image/png",
      sizeBytes: 1024,
      width: 1200,
      height: 1200,
      isPrimary: true,
      sortOrder: 0,
    });

    expect(result).toEqual({ mediaId: "media-1" });
    expect(mockRecordShopProductMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "product-1",
        mimeType: "image/png",
        isPrimary: true,
      }),
    );
  });

  it("updates structured product content from admin form data", async () => {
    const formData = new FormData();
    formData.set("productId", "product-1");
    formData.set("richText", "Cold-water gear.");
    formData.set("bulletTitle", "Highlights");
    formData.set("bullets", "Warm\nDurable");
    formData.set("specs", "Material: Neoprene\nFit: Slim");

    const result = await updateShopProductContentFormAction(
      { errors: null, message: null, success: false, resetKey: 0 },
      formData,
    );

    expect(mockUpdateShopProductContent).toHaveBeenCalledWith("product-1", [
      { type: "rich_text", body: "Cold-water gear." },
      { type: "bullets", title: "Highlights", items: ["Warm", "Durable"] },
      {
        type: "specs",
        rows: [
          { label: "Material", value: "Neoprene" },
          { label: "Fit", value: "Slim" },
        ],
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("upserts a shipping zone and its rate from form data", async () => {
    mockUpsertShippingZone.mockResolvedValue({ id: "zone-1" });
    const formData = new FormData();
    formData.set("name", "Portugal");
    formData.set("slug", "portugal");
    formData.set("allowedCountries", "pt");
    formData.set("sortOrder", "0");
    formData.set("rateName", "Standard");
    formData.set("ratePrice", "5.50");
    formData.set("active", "on");
    formData.set("rateActive", "on");

    const result = await saveShippingZoneRateFormAction(
      { errors: null, message: null, success: false, resetKey: 0 },
      formData,
    );

    expect(mockUpsertShippingZone).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedCountries: ["PT"],
      }),
    );
    expect(mockUpsertShippingRate).toHaveBeenCalledWith(
      expect.objectContaining({
        zoneId: "zone-1",
        priceCents: 550,
      }),
    );
    expect(result.success).toBe(true);
  });

  it("updates order fulfillment from form data", async () => {
    const formData = new FormData();
    formData.set("orderId", "order-1");
    formData.set("fulfillmentStatus", "fulfilled");
    formData.set("trackingCarrier", "DHL");
    formData.set("trackingNumber", "TRACK-1");

    const result = await updateOrderFulfillmentFormAction(
      { errors: null, message: null, success: false, resetKey: 0 },
      formData,
    );

    expect(mockUpdateOrderFulfillment).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-1",
        fulfillmentStatus: "fulfilled",
        trackingCarrier: "DHL",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects unsafe tracking URL schemes", async () => {
    const formData = new FormData();
    formData.set("orderId", "order-1");
    formData.set("fulfillmentStatus", "fulfilled");
    formData.set("trackingUrl", "javascript:alert(1)");

    const result = await updateOrderFulfillmentFormAction(
      { errors: null, message: null, success: false, resetKey: 0 },
      formData,
    );

    expect(result.success).toBe(false);
    expect(result.errors?.trackingUrl).toEqual([
      "Tracking URL must start with http:// or https://",
    ]);
    expect(mockUpdateOrderFulfillment).not.toHaveBeenCalledWith(
      expect.objectContaining({ trackingUrl: "javascript:alert(1)" }),
    );
  });
});
