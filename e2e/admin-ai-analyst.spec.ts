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
  test("renders the global AI panel inside the AI tab in /admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");

    await expect(page.getByRole("button", { name: /^contacts$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^tags$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^ai$/i })).toBeVisible();
    await expect(page.getByText("AI Analyst")).toHaveCount(0);

    await page.getByRole("button", { name: /^ai$/i }).click();

    await expect(page.getByText("AI Analyst")).toBeVisible();
    await expect(
      page.getByText("Grounded search and synthesis across your CRM"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /ask ai/i })).toBeVisible();
  });

  test("renders the contact-scoped AI panel below applications on a contact page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");

    const firstContactLink = page.locator('a[href^="/admin/contacts/"]').first();
    await expect(firstContactLink).toBeVisible();
    await firstContactLink.click();

    await expect(page).toHaveURL(/\/admin\/contacts\//);
    await expect(page.getByText("AI Analyst")).toBeVisible();
    await expect(page.getByRole("button", { name: /ask ai/i })).toBeVisible();

    const applicationCard = page.locator("[data-slot='card']").filter({
      has: page.getByRole("button", { name: /reviewing/i }).first(),
    }).first();
    const aiCard = page.locator("[data-slot='card']").filter({
      has: page.getByText("AI Analyst"),
    }).first();
    const contactInfoCard = page.locator("[data-slot='card']").filter({
      has: page.getByText("Contact Info"),
    }).first();

    const [applicationBox, aiBox, contactInfoBox] = await Promise.all([
      applicationCard.boundingBox(),
      aiCard.boundingBox(),
      contactInfoCard.boundingBox(),
    ]);

    expect(applicationBox).not.toBeNull();
    expect(aiBox).not.toBeNull();
    expect(contactInfoBox).not.toBeNull();

    expect(Math.abs((aiBox?.x ?? 0) - (applicationBox?.x ?? 0))).toBeLessThan(40);
    expect((contactInfoBox?.x ?? 0) - (aiBox?.x ?? 0)).toBeGreaterThan(120);
    expect((aiBox?.y ?? 0) - (applicationBox?.y ?? 0)).toBeGreaterThan(40);
  });
});
