import { test, expect } from "@playwright/test";

test.describe("Academy", () => {
  test("academy page lists programs", async ({ page }) => {
    await page.goto("/academy");
    await expect(page.getByText(/photography/i)).toBeVisible();
  });

  test("can navigate to application form for open program", async ({
    page,
  }) => {
    await page.goto("/academy");

    // Photography is the only open program
    const applyLink = page.getByRole("link", { name: /apply|photography/i }).first();
    await applyLink.click();

    // Should reach the application page
    await expect(page).toHaveURL(/\/academy\/photography/);
  });

  test("application form shows first step", async ({ page }) => {
    await page.goto("/academy/photography/apply");

    // Should show the personal info step
    await expect(
      page.getByRole("heading", { name: /personal information/i }),
    ).toBeVisible();
  });

  test("application form validates required fields", async ({ page }) => {
    await page.goto("/academy/photography/apply");

    // Try to proceed without filling anything — look for a Next button
    const nextButton = page.getByRole("button", { name: /next/i });
    if (await nextButton.isVisible()) {
      await nextButton.click();
      // Should show validation errors or stay on the same step
      await expect(page.getByText(/required|please/i).first()).toBeVisible();
    }
  });
});
