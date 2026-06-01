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
