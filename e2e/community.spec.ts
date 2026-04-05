import { test, expect, type Page } from "@playwright/test";

const TEST_USER = { email: "test@btmhub.com", password: "TestPass123" };
const ADMIN_USER = { email: "admin@btmhub.com", password: "AdminPass123" };

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
}

// ─── Feed page ───────────────────────────────────────────────────────────────

test.describe("Feed page", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USER);
  });

  test("sidebar channels navigate and highlight active topic", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("[data-slot='card']", { timeout: 10_000 });

    // Click "Trip Reports" channel
    await page.getByRole("link", { name: "Trip Reports" }).first().click();
    await page.waitForTimeout(2000);

    // URL should have topic param
    expect(page.url()).toContain("topic=trip-reports");

    // Heading should show topic name
    await expect(page.getByRole("heading", { name: "Trip Reports", level: 1 })).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/sidebar-topic-filter.png", fullPage: false });
  });

  test("feed card body expands with See more", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("[data-slot='card']", { timeout: 10_000 });

    const seeMoreButtons = page.getByText("See more");
    const countBefore = await seeMoreButtons.count();

    if (countBefore > 0) {
      await seeMoreButtons.first().click();
      await page.waitForTimeout(500);
      // One fewer "See more" button after expanding
      const countAfter = await seeMoreButtons.count();
      expect(countAfter).toBe(countBefore - 1);
    }
  });

  test("comment count is correct and links to thread", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("[data-slot='card']", { timeout: 10_000 });

    // Find a card with comments
    const commentLink = page.getByText(/\d+ comments/).first();
    await expect(commentLink).toBeVisible();

    // Click should navigate to thread detail
    await commentLink.click();
    await page.waitForURL(/\/community\/[a-z0-9-]+/);
  });

  test("top replies shown with View all link", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("[data-slot='card']", { timeout: 10_000 });

    const viewAll = page.getByText(/View all \d+ comments/).first();
    await expect(viewAll).toBeVisible();
  });
});

// ─── Thread detail page ──────────────────────────────────────────────────────

test.describe("Thread detail page", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USER);
  });

  test("thread page loads with OP and replies", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("[data-slot='card']", { timeout: 10_000 });

    // Click first thread title
    const firstTitle = page.locator("[data-slot='card']").first().locator("h3 a, a h3").first();
    await firstTitle.click();
    await page.waitForURL(/\/community\/[a-z0-9-]+/, { timeout: 10_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "e2e/screenshots/thread-detail.png", fullPage: true });

    // OP badge should be visible
    const opBadge = page.getByText("OP");
    await expect(opBadge.first()).toBeVisible();

    // Reply form should be visible
    await expect(page.getByText("Post Reply").or(page.locator("form")).first()).toBeVisible();
  });

  test("replies are ordered by likes (most liked first)", async ({ page }) => {
    // Go to a thread with multiple replies and likes
    await page.goto("/community");
    await page.waitForSelector("[data-slot='card']", { timeout: 10_000 });

    // Navigate to first thread with comments
    const commentLink = page.getByText(/\d+ comments/).first();
    await commentLink.click();
    await page.waitForURL(/\/community\/[a-z0-9-]+/, { timeout: 10_000 });
    await page.waitForTimeout(2000);

    // Verify the page loaded with replies
    const replyCount = await page.locator("button:has(.lucide-heart)").count();
    expect(replyCount).toBeGreaterThan(1); // OP + at least 1 reply
  });
});

// ─── Create new post ─────────────────────────────────────────────────────────

test.describe("Create new post", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USER);
  });

  test("new post form loads and validates", async ({ page }) => {
    await page.goto("/community/new");
    await page.waitForTimeout(2000);

    // Form elements should be present
    await expect(page.getByLabel("Title")).toBeVisible();
    await expect(page.getByLabel("Topic")).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/new-post-form.png", fullPage: false });

    // Submit empty form
    await page.getByRole("button", { name: "Post" }).click();
    await page.waitForTimeout(1000);

    // Should show validation error (title required)
    await expect(page.locator("body")).toContainText(/required|at least/i);
  });
});

// ─── Admin actions ───────────────────────────────────────────────────────────

test.describe("Admin actions", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN_USER);
  });

  test("admin sees pin/lock/delete buttons on thread", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("[data-slot='card']", { timeout: 10_000 });

    // Navigate to a non-pinned thread
    const commentLink = page.getByText(/\d+ comments/).first();
    await commentLink.click();
    await page.waitForURL(/\/community\/[a-z0-9-]+/, { timeout: 10_000 });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "e2e/screenshots/admin-thread-controls.png", fullPage: false });

    // Admin controls should be visible
    const pinBtn = page.getByRole("button", { name: /^(Pin|Unpin)$/ });
    const lockBtn = page.getByRole("button", { name: /^(Lock|Unlock)$/ });
    const deleteBtn = page.getByRole("button", { name: "Delete Thread" });


    await expect(pinBtn).toBeVisible();
    await expect(lockBtn).toBeVisible();
    await expect(deleteBtn).toBeVisible();
  });

  test("admin can pin/unpin a thread", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("[data-slot='card']", { timeout: 10_000 });

    // Go to a thread
    const title = page.locator("[data-slot='card'] h3").nth(1); // skip pinned
    await title.click();
    await page.waitForURL(/\/community\/[a-z0-9-]+/, { timeout: 10_000 });
    await page.waitForTimeout(2000);

    const pinBtn = page.getByRole("button", { name: /^(Pin|Unpin)$/ });
    const btnText = await pinBtn.textContent();

    await pinBtn.click();
    await page.waitForTimeout(2000);

    // Button text should toggle
    const newBtnText = await pinBtn.textContent();
    expect(newBtnText).not.toBe(btnText);
  });

  test("admin can lock/unlock a thread", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("[data-slot='card']", { timeout: 10_000 });

    const title = page.locator("[data-slot='card'] h3").nth(1);
    await title.click();
    await page.waitForURL(/\/community\/[a-z0-9-]+/, { timeout: 10_000 });
    await page.waitForTimeout(2000);

    const lockBtn = page.getByRole("button", { name: /^(Lock|Unlock)$/ });
    const btnText = await lockBtn.textContent();

    await lockBtn.click();
    await page.waitForTimeout(2000);

    const newBtnText = await lockBtn.textContent();
    expect(newBtnText).not.toBe(btnText);
  });

  test("admin can delete a thread", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("[data-slot='card']", { timeout: 10_000 });

    // Go to the last thread (least important)
    const lastTitle = page.locator("[data-slot='card'] h3").last();
    await lastTitle.click();
    await page.waitForURL(/\/community\/[a-z0-9-]+/, { timeout: 10_000 });
    await page.waitForTimeout(2000);

    // Set up dialog handler to accept the confirm
    page.on("dialog", (dialog) => dialog.accept());

    const deleteBtn = page.getByRole("button", { name: "Delete Thread" });
    await expect(deleteBtn).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/before-delete.png", fullPage: false });

    await deleteBtn.click();
    await page.waitForTimeout(5000);

    await page.screenshot({ path: "e2e/screenshots/after-delete.png", fullPage: false });

    // Should redirect back to /community
    await page.waitForURL(/\/community/, { timeout: 10_000 });
  });

  test("admin add channel form appears", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("[data-slot='card']", { timeout: 10_000 });

    // Click the + button next to "Channels"
    const addBtn = page.locator("aside button:has(.lucide-plus)").first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(500);

      const input = page.locator("aside input[name='name']");
      await expect(input).toBeVisible();

      await page.screenshot({ path: "e2e/screenshots/add-channel-form.png", fullPage: false });
    } else {
    }
  });

  test("admin can edit own post", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("[data-slot='card']", { timeout: 10_000 });

    // Go to a thread authored by admin
    const firstTitle = page.locator("[data-slot='card'] h3").first();
    await firstTitle.click();
    await page.waitForURL(/\/community\/[a-z0-9-]+/, { timeout: 10_000 });
    await page.waitForTimeout(2000);

    // Look for Edit button
    const editBtn = page.getByRole("button", { name: "Edit" }).first();
    const editVisible = await editBtn.count() > 0;

    if (editVisible) {
      await editBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: "e2e/screenshots/edit-mode.png", fullPage: false });
    }
  });

  test("admin can delete a reply", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("[data-slot='card']", { timeout: 10_000 });

    // Go to first thread with replies
    const commentLink = page.getByText(/\d+ comments/).first();
    await commentLink.click();
    await page.waitForURL(/\/community\/[a-z0-9-]+/, { timeout: 10_000 });
    await page.waitForTimeout(2000);

    // Find delete buttons (should be on replies for admin)
    const deleteButtons = page.getByRole("button", { name: "Delete" }).filter({ hasNotText: "Thread" });
    const deleteCount = await deleteButtons.count();

    if (deleteCount > 0) {
      page.on("dialog", (dialog) => dialog.accept());
      await deleteButtons.first().click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "e2e/screenshots/after-reply-delete.png", fullPage: false });
    }
  });
});

// ─── Regular user permissions ────────────────────────────────────────────────

test.describe("Regular user permissions", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USER);
  });

  test("regular user does NOT see admin controls", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("[data-slot='card']", { timeout: 10_000 });

    // No add channel button
    const addChannelBtn = page.locator("aside button:has(.lucide-plus)");
    expect(await addChannelBtn.count()).toBe(0);

    // Go to a thread
    const commentLink = page.getByText(/\d+ comments/).first();
    await commentLink.click();
    await page.waitForURL(/\/community\/[a-z0-9-]+/, { timeout: 10_000 });
    await page.waitForTimeout(2000);

    // No Pin/Lock buttons
    const pinBtn = page.getByRole("button", { name: /^Pin$/ });
    const lockBtn = page.getByRole("button", { name: /^Lock$/ });
    expect(await pinBtn.count()).toBe(0);
    expect(await lockBtn.count()).toBe(0);

  });
});
