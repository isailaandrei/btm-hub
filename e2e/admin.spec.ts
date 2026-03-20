import { test, expect } from "@playwright/test";

const ADMIN_USER = { email: "admin@btmhub.com", password: "AdminPass123" };
const REGULAR_USER = { email: "test@btmhub.com", password: "TestPass123" };

test.describe("Admin", () => {
  test("non-admin cannot access /admin", async ({ page }) => {
    // Log in as regular user
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(REGULAR_USER.email);
    await page.getByLabel(/password/i).fill(REGULAR_USER.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL("**/profile");

    // Try to access admin
    await page.goto("/admin");

    // Should be redirected or see unauthorized
    const url = page.url();
    const pageContent = await page.textContent("body");
    const blocked =
      url.includes("/login") ||
      url.includes("/profile") ||
      pageContent?.includes("Unauthorized") ||
      pageContent?.includes("unauthorized");
    expect(blocked).toBe(true);
  });

  test("admin can access /admin/applications", async ({ page }) => {
    // Log in as admin
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(ADMIN_USER.email);
    await page.getByLabel(/password/i).fill(ADMIN_USER.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL("**/profile");

    // Navigate to admin (applications tab is within /admin, not a separate route)
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);

    // Should see the applications content
    await expect(page.getByText(/application/i).first()).toBeVisible();
  });
});
