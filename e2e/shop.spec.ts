import { expect, test } from "@playwright/test";

test.describe("Shop", () => {
  test("renders the public shop and empty cart surfaces", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByRole("heading", { name: "Shop" })).toBeVisible();

    await page.goto("/shop/cart");
    await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
    await expect(page.getByText("Your cart is empty.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Shop products" })).toBeVisible();
  });

  test("supports reviewing and editing a stored cart line", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "btm-shop-cart",
        JSON.stringify({
          lines: [
            {
              variantId: "00000000-0000-4000-8000-000000000101",
              quantity: 1,
              productSlug: "mock-btm-freedive-hoodie",
              productTitle: "Mock BTM Freedive Hoodie",
              variantTitle: "Black / M",
              priceCents: 7900,
              imageUrl: "/mock-shop-product.png",
              requiresShipping: true,
            },
          ],
        }),
      );
    });

    await page.goto("/shop/cart");
    await expect(page.getByText("Mock BTM Freedive Hoodie")).toBeVisible();

    await page.getByRole("button", { name: "Increase quantity" }).click();
    await expect(page.getByRole("main").getByText("2", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Remove item" }).click();
    await expect(page.getByText("Your cart is empty.")).toBeVisible();
  });

  test("renders checkout return pages", async ({ page }) => {
    await page.goto("/shop/checkout/canceled?order_id=order-1");
    await expect(
      page.getByRole("heading", { name: "Checkout canceled" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Return to cart" })).toBeVisible();

    await page.goto("/shop/checkout/success?session_id=cs_test_123");
    await expect(page.getByRole("heading", { name: "Order received" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View orders" })).toBeVisible();
  });
});
