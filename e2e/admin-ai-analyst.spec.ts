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
  test("renders the global AI panel in /admin without crashing", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");

    await expect(page.getByText("AI Analyst")).toBeVisible();
    await expect(
      page.getByText("Grounded search and synthesis across your CRM"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /ask ai/i })).toBeVisible();
  });

  test("renders the contact-scoped AI panel on a contact page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");

    const firstContactLink = page.locator('a[href^="/admin/contacts/"]').first();
    await expect(firstContactLink).toBeVisible();
    await firstContactLink.click();

    await expect(page).toHaveURL(/\/admin\/contacts\//);
    await expect(page.getByText("AI Analyst")).toBeVisible();
    await expect(page.getByRole("button", { name: /ask ai/i })).toBeVisible();
  });
});
