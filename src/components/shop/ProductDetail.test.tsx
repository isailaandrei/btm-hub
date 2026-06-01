import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MOCK_SHOP_PRODUCT } from "@/lib/shop/mock-product";
import { ProductDetail } from "./ProductDetail";

describe("ProductDetail", () => {
  it("renders the template-inspired purchase layout and product sections", () => {
    const html = renderToStaticMarkup(
      <ProductDetail product={MOCK_SHOP_PRODUCT} />,
    );

    expect(html).toContain("Mock BTM Freedive Hoodie");
    expect(html).toContain("New arrival");
    expect(html).toContain("Select a variant");
    expect(html).toContain("Black / M");
    expect(html).toContain("Quantity");
    expect(html).toContain("Details");
    expect(html).toContain("Shipping &amp; taxes");
    expect(html).toContain("Fulfillment");
  });
});
