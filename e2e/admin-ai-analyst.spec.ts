import { expect, test } from "@playwright/test";

const ADMIN_USER = { email: "admin@btmhub.com", password: "AdminPass123" };

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN_USER.email);
  await page.getByLabel(/password/i).fill(ADMIN_USER.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL("**/profile");
}

test.describe("Admin AI Analyst", () => {
  test("hides the global AI Analyst tab in /admin while the feature is paused", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");

    await expect(page.getByRole("button", { name: /^contacts$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^tags$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^ai analyst$/i })).toBeHidden();
  });

  test("hides the contact-scoped AI panel on a contact page while the feature is paused", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");

    const firstContactLink = page.locator('a[href^="/admin/contacts/"]').first();
    await expect(firstContactLink).toBeVisible();
    await firstContactLink.click();

    await expect(page).toHaveURL(/\/admin\/contacts\//);
    await expect(page.getByText("AI Analyst")).toBeHidden();
    await expect(page.getByRole("button", { name: /ask ai/i })).toBeHidden();
  });
});
