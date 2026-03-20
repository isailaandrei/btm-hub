import { test, expect } from "@playwright/test";

test.describe("CMS pages", () => {
  test("films page loads", async ({ page }) => {
    await page.goto("/films");
    await expect(page.getByRole("heading", { name: /films/i })).toBeVisible();
  });

  test("team page loads", async ({ page }) => {
    await page.goto("/team");
    await expect(
      page.getByRole("heading", { name: /our team/i }),
    ).toBeVisible();
  });

  test("partners page loads", async ({ page }) => {
    await page.goto("/partners");
    await expect(
      page.getByRole("heading", { name: /partners/i }),
    ).toBeVisible();
  });

  test("studio route loads", async ({ page }) => {
    const response = await page.goto("/studio");
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe("navigation includes new links", () => {
  test("navbar has Films and Team links", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: "Films" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Team" })).toBeVisible();
  });

  test("Films link navigates to /films", async ({ page }) => {
    await page.goto("/");
    await page.locator("nav").getByRole("link", { name: "Films" }).click();
    await expect(page).toHaveURL(/\/films/);
  });
});

test.describe("program page CMS integration", () => {
  test("program page renders static content even without CMS", async ({
    page,
  }) => {
    await page.goto("/academy/photography");
    await expect(
      page.getByText(/underwater photography/i),
    ).toBeVisible();
    // Apply button should be present
    await expect(
      page.getByRole("link", { name: /apply now/i }),
    ).toBeVisible();
  });
});

test.describe("homepage partners section", () => {
  test("partners section renders on homepage", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/trusted partners/i)).toBeVisible();
  });
});
