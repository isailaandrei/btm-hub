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

  test("admin can access /admin and see contacts tab", async ({ page }) => {
    // Collect failed network requests
    const failedRequests: { url: string; status: number }[] = [];
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedRequests.push({ url: response.url(), status: response.status() });
      }
    });

    // Log in as admin
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(ADMIN_USER.email);
    await page.getByLabel(/password/i).fill(ADMIN_USER.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL("**/profile");

    // Navigate to admin
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);

    // Should see the Contacts and Tags tab buttons
    await expect(page.getByRole("button", { name: /contacts/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /tags/i })).toBeVisible();

    // Should NOT have any 404 errors on API requests
    const api404s = failedRequests.filter(
      (r) => r.status === 404 && r.url.includes("/rest/v1/"),
    );
    expect(api404s, `API 404 errors: ${JSON.stringify(api404s)}`).toHaveLength(0);
  });
});
