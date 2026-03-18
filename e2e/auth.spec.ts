import { test, expect } from "@playwright/test";

const TEST_USER = { email: "test@btmhub.com", password: "TestPass123" };

test.describe("Authentication", () => {
  test("shows validation errors for invalid login", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    // Should show validation errors (empty fields)
    await expect(page.getByText(/email/i)).toBeVisible();
  });

  test("shows error for wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("wrong@test.com");
    await page.getByLabel(/password/i).fill("WrongPass123");
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible();
  });

  test("can log in and reach profile page", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    // Should redirect to /profile
    await page.waitForURL("**/profile");
    await expect(page).toHaveURL(/\/profile/);
  });

  test("redirects unauthenticated users from /profile to /login", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects authenticated users from /login to /profile", async ({
    page,
  }) => {
    // Log in first
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL("**/profile");

    // Now visit /login — should redirect back
    await page.goto("/login");
    await expect(page).toHaveURL(/\/profile/);
  });
});
