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

// Create a small test image file
function createTestImage(): string {
  const dir = join(process.cwd(), "e2e", "fixtures");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "test-image.png");

  // Minimal valid 1x1 red PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "base64",
  );
  writeFileSync(path, png);
  return path;
}

test.describe("Image attachments", () => {
  test.setTimeout(60_000);

  test("can attach an image and see the preview", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/community/messages");

    // Open conversation with Emma
    await expect(page.getByText("Emma Thompson")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("Emma Thompson").click();
    await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, {
      timeout: 10_000,
    });

    // Create test image
    const imagePath = createTestImage();

    // Listen for console output from the app
    page.on("console", (msg) => {
      console.log(`[browser ${msg.type()}]`, msg.text());
    });

    // Use setInputFiles on the image file input (the one with accept="image/*")
    const fileInput = page.locator('input[type="file"][accept*="image"]');
    await fileInput.setInputFiles(imagePath);

    // Wait for React state to update
    await page.waitForTimeout(1000);

    // Take a screenshot
    await page.screenshot({
      path: "e2e/screenshots/attachment-after-select.png",
      fullPage: false,
    });

    // The preview thumbnail should appear
    const preview = page.locator('img[alt="test-image.png"]');
    await expect(preview).toBeVisible({ timeout: 5_000 });
  });

  test("clicking 'Add image' button triggers file input", async ({
    page,
  }) => {
    await login(page, TEST_USER);
    await page.goto("/community/messages");

    await expect(page.getByText("Emma Thompson")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("Emma Thompson").click();
    await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, {
      timeout: 10_000,
    });

    // Check that the "Add image" button exists
    const imageBtn = page.getByTitle("Add image");
    await expect(imageBtn).toBeVisible();

    // Verify clicking it triggers the file input
    // We can check this by listening for the file chooser
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 5_000 }),
      imageBtn.click(),
    ]);

    expect(fileChooser).toBeTruthy();
    console.log("File chooser opened:", fileChooser.isMultiple());
  });
});
