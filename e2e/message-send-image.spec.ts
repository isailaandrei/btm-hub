import { test, expect, type Page } from "@playwright/test";
import { join } from "path";
import { writeFileSync, mkdirSync } from "fs";

const TEST_USER = { email: "test@btmhub.com", password: "TestPass123" };

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
}

function createTestImage(): string {
  const dir = join(process.cwd(), "e2e", "fixtures");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "test-image.png");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "base64",
  );
  writeFileSync(path, png);
  return path;
}

async function openAdminConversation(page: Page) {
  await page.goto("/community/messages");
  await expect(page.getByText("Admin User")).toBeVisible({ timeout: 10_000 });
  await page.getByText("Admin User").click();
  await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, { timeout: 10_000 });
  await page.waitForTimeout(1000);
}

test.describe("Image attachments", () => {
  test.setTimeout(60_000);

  test("can attach an image and see the preview thumbnail", async ({ page }) => {
    await login(page, TEST_USER);
    await openAdminConversation(page);

    const imagePath = createTestImage();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(500);

    const preview = page.locator('img[alt="test-image.png"]');
    await expect(preview).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: "e2e/screenshots/image-attachment-preview.png", fullPage: false });
  });

  test("clicking attach button opens file picker", async ({ page }) => {
    await login(page, TEST_USER);
    await openAdminConversation(page);

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 5_000 }),
      page.getByTitle("Attach file").click(),
    ]);

    expect(fileChooser).toBeTruthy();
    expect(fileChooser.isMultiple()).toBe(true);
  });

  test("can remove an attached image before sending", async ({ page }) => {
    await login(page, TEST_USER);
    await openAdminConversation(page);

    const imagePath = createTestImage();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(500);

    const preview = page.locator('img[alt="test-image.png"]');
    await expect(preview).toBeVisible({ timeout: 5_000 });

    // Hover to reveal remove button
    const previewContainer = preview.locator("..");
    await previewContainer.hover();
    await page.getByTitle("Remove").click();

    await expect(preview).not.toBeVisible();
  });

  test("can attach multiple images", async ({ page }) => {
    await login(page, TEST_USER);
    await openAdminConversation(page);

    const imagePath = createTestImage();
    const fileInput = page.locator('input[type="file"]');

    // Attach first image
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(500);

    // Attach second image
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(500);

    // Should have 2 preview thumbnails
    const previews = page.locator('img[alt="test-image.png"]');
    await expect(previews).toHaveCount(2);
  });
});
