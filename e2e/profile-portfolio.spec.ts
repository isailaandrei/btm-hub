import { expect, test, type Page } from "@playwright/test";

const TEST_USER = { email: "test@btmhub.com", password: "TestPass123" };
const ADMIN_USER = { email: "admin@btmhub.com", password: "AdminPass123" };

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}

async function deletePortfolioImagesByName(page: Page, name: string) {
  const images = page.getByRole("img", { name });
  let count = await images.count();

  while (count > 0) {
    const card = page.locator("div.rounded-lg", { has: images.first() }).first();
    await card.getByRole("button", { name: /delete/i }).click();
    await expect(images).toHaveCount(count - 1, { timeout: 10_000 });
    count -= 1;
  }
}

test.describe("Profile portfolio", () => {
  test("anonymous users cannot view member profiles", async ({ page }) => {
    await page.goto("/community/members/11111111-1111-1111-1111-111111111111");
    await expect(page).toHaveURL(/\/login/);
  });

  test("member can open portfolio management", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/profile/portfolio");

    await expect(
      page.getByRole("heading", { name: "Portfolio" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /upload images/i }),
    ).toBeVisible();
  });

  test("member can upload a tiny PNG portfolio image", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/profile/portfolio");
    await deletePortfolioImagesByName(page, "portfolio-e2e.png");

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64",
    );

    await page
      .locator("input[accept='image/jpeg,image/png,image/webp']")
      .last()
      .setInputFiles({
        name: "portfolio-e2e.png",
        mimeType: "image/png",
        buffer: png,
      });

    await expect(page.getByText(/portfolio-e2e\.png/)).toBeVisible();
    await expect(
      page.getByRole("img", { name: "portfolio-e2e.png" }),
    ).toBeVisible({ timeout: 30_000 });

    await deletePortfolioImagesByName(page, "portfolio-e2e.png");
  });

  test("admin contact detail shows portfolio panel", async ({ page }) => {
    await login(page, ADMIN_USER);
    await page.goto("/admin");

    const firstContact = page.locator("a[href^='/admin/contacts/']").first();
    await expect(firstContact).toBeVisible();
    await firstContact.click();
    await page.waitForURL(/\/admin\/contacts\//);

    await expect(page.getByText("Portfolio", { exact: true })).toBeVisible();
  });
});
