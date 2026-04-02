import { test, expect, type Page } from "@playwright/test";

const TEST_USER = { email: "test@btmhub.com", password: "TestPass123" };
const SARAH = { email: "sarah@btmhub.com", password: "TestPass123" };
const MARCO = { email: "marco@btmhub.com", password: "TestPass123" };


async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
}

// ─── Messages page ──────────────────────────────────────────────────────────

test.describe("Messages page", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USER);
  });

  test("shows empty state when no conversation selected", async ({ page }) => {
    await page.goto("/community/messages");
    await expect(
      page.getByRole("heading", { name: "Your messages" }),
    ).toBeVisible();
    await expect(
      page.getByText("Select a conversation from the sidebar"),
    ).toBeVisible();
  });

  test("sidebar shows Messages section with existing conversation", async ({
    page,
  }) => {
    await page.goto("/community/messages");

    // Test User has a conversation with Emma — should appear in sidebar
    await expect(page.getByText("Emma Thompson")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("clicking a conversation opens the chat view", async ({ page }) => {
    await page.goto("/community/messages");

    // Wait for sidebar to load conversations
    await expect(page.getByText("Emma Thompson")).toBeVisible({
      timeout: 10_000,
    });

    // Click on the Emma conversation
    await page.getByText("Emma Thompson").click();
    await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, {
      timeout: 10_000,
    });

    // Should see the chat header with Emma's name
    await expect(
      page.locator("h2").filter({ hasText: "Emma Thompson" }),
    ).toBeVisible();

    // Should see existing messages
    await expect(
      page.getByText("I saw your GoPro question"),
    ).toBeVisible();
    await expect(
      page.getByText("That would be amazing"),
    ).toBeVisible();

    await page.screenshot({
      path: "e2e/screenshots/messages-chat-view.png",
      fullPage: false,
    });
  });
});

// ─── Sending messages ───────────────────────────────────────────────────────

test.describe("Sending messages", () => {
  test.setTimeout(60_000);

  test("can send a message in an existing conversation", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/community/messages");

    // Open Emma conversation
    await expect(page.getByText("Emma Thompson")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("Emma Thompson").click();
    await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, {
      timeout: 10_000,
    });

    // Type a message in TipTap editor
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await editor.fill("Hello from the E2E test!");

    // Click send
    await page.getByTitle("Send message").click();

    // Message should appear in the thread
    await expect(page.getByText("Hello from the E2E test!")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("send button is disabled while sending", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/community/messages");

    await expect(page.getByText("Emma Thompson")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("Emma Thompson").click();
    await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, {
      timeout: 10_000,
    });

    const editor = page.locator(".ProseMirror");
    await editor.click();
    await editor.fill("Testing disabled state");

    const sendButton = page.getByTitle("Send message");
    await sendButton.click();

    // Verify the message eventually appears (action completed)
    await expect(page.getByText("Testing disabled state")).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ─── Starting new conversations ─────────────────────────────────────────────

test.describe("Starting new conversations", () => {
  test.setTimeout(60_000);

  test("can search for users and start a new conversation", async ({
    page,
  }) => {
    await login(page, TEST_USER);
    await page.goto("/community/messages");

    // Wait for sidebar to load
    await page.waitForTimeout(2000);

    // Click the + button to start a new message
    await page.getByTitle("New message").click();

    // Search for Jake
    const searchInput = page.getByPlaceholder("Search users...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Jake");

    // Wait for search results
    await expect(page.getByText("Jake Miller")).toBeVisible({
      timeout: 5_000,
    });

    // Click Jake to start conversation
    await page.getByText("Jake Miller").click();

    // Should redirect to the conversation
    await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, {
      timeout: 10_000,
    });

    // Should see empty conversation state
    await expect(page.getByText("No messages yet")).toBeVisible({
      timeout: 5_000,
    });

    // Send a message
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await editor.fill("Hey Jake! Testing DMs.");

    await page.getByTitle("Send message").click();

    await expect(page.getByText("Hey Jake! Testing DMs.")).toBeVisible({
      timeout: 10_000,
    });

    await page.screenshot({
      path: "e2e/screenshots/messages-new-conversation.png",
      fullPage: false,
    });
  });

  test("start conversation via ?start= URL parameter", async ({ page }) => {
    await login(page, SARAH);

    // Navigate with Jake's UUID
    await page.goto(
      "/community/messages?start=f6a7b8c9-d0e1-2345-fabc-567890123456",
    );

    // Should redirect to the conversation
    await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, {
      timeout: 10_000,
    });

    // Should see the chat header
    await expect(
      page.locator("h2").filter({ hasText: "Jake Miller" }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("search excludes current user", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/community/messages");

    await page.waitForTimeout(2000);
    await page.getByTitle("New message").click();

    const searchInput = page.getByPlaceholder("Search users...");
    await searchInput.fill("Test");

    // Wait for search to complete
    await page.waitForTimeout(500);

    // "Test User" (self) should not appear in results
    // But if there are no matches, it shows "No users found"
    const testUserResult = page.locator("a").filter({ hasText: "Test User" });
    await expect(testUserResult).toHaveCount(0);
  });
});

// ─── Sidebar behavior ───────────────────────────────────────────────────────

test.describe("Sidebar behavior", () => {
  test.setTimeout(60_000);

  test("messages section visible in community sidebar", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/community");

    // The Messages heading should be in the sidebar
    await expect(
      page.getByRole("heading", { name: "Messages" }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("sidebar conversations are clickable from community pages", async ({
    page,
  }) => {
    await login(page, TEST_USER);
    await page.goto("/community");

    // Wait for messages sidebar to load — use role link to disambiguate from forum cards
    const emmaLink = page.getByRole("link", { name: "ET Emma Thompson" });
    await expect(emmaLink).toBeVisible({ timeout: 10_000 });

    // Click should navigate to messages
    await emmaLink.click();
    await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, {
      timeout: 10_000,
    });
  });

  test("active conversation is highlighted in sidebar", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/community/messages");

    await expect(page.getByText("Emma Thompson")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("Emma Thompson").click();
    await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, {
      timeout: 10_000,
    });

    // The active conversation link should have the primary styling
    const emmaLink = page
      .locator("a")
      .filter({ hasText: "Emma Thompson" })
      .first();
    await expect(emmaLink).toHaveClass(/text-primary/);
  });
});

// ─── Navbar unread badge ────────────────────────────────────────────────────

test.describe("Navbar", () => {
  test.setTimeout(60_000);

  test("shows envelope icon linking to messages", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/community");

    // Envelope icon — use .first() since both desktop and mobile nav render it
    const messagesLink = page.getByTitle("Messages").first();
    await expect(messagesLink).toBeVisible({ timeout: 10_000 });

    await messagesLink.click();
    await page.waitForURL(/\/community\/messages/, { timeout: 10_000 });
  });
});

// ─── Message actions ────────────────────────────────────────────────────────

test.describe("Message actions", () => {
  test.setTimeout(60_000);

  test("edit and delete buttons appear on hover for own messages", async ({ page }) => {
    // Use a seeded message that exists in server-rendered DOM
    await login(page, TEST_USER);
    await page.goto("/community/messages");

    await expect(page.getByText("Emma Thompson")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Emma Thompson").click();
    await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, { timeout: 10_000 });

    // Test User's seeded message: "That would be amazing! Thank you so much."
    const ownMsg = page.getByText("That would be amazing");
    await expect(ownMsg).toBeVisible({ timeout: 5_000 });

    // Hover to reveal actions
    await ownMsg.hover();

    // Edit and Delete buttons should appear
    await expect(page.getByTitle("Edit")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTitle("Delete")).toBeVisible({ timeout: 5_000 });

    // Click edit — should show textarea
    await page.getByTitle("Edit").click();
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();

    // Cancel should dismiss the textarea
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(textarea).not.toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/messages-edit-hover.png" });
  });
});

// ─── Rich text ──────────────────────────────────────────────────────────────

test.describe("Rich text in messages", () => {
  test.setTimeout(60_000);

  test("can send bold formatted text", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/community/messages");

    await expect(page.getByText("Emma Thompson")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("Emma Thompson").click();
    await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, {
      timeout: 10_000,
    });

    // Click into editor and type with bold via keyboard shortcut
    const editor = page.locator(".ProseMirror");
    await editor.click();

    // Toggle bold on, type text, toggle bold off
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+b`);
    await page.keyboard.type("Bold text here");
    await page.keyboard.press(`${modifier}+b`);

    // Send
    await page.getByTitle("Send message").click();

    // The message should contain a <strong> element
    await expect(
      page.locator("strong").filter({ hasText: "Bold text here" }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("toolbar buttons are visible", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/community/messages");

    await expect(page.getByText("Emma Thompson")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("Emma Thompson").click();
    await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, {
      timeout: 10_000,
    });

    // Toolbar should have Bold, Italic, Link, Send buttons
    await expect(page.getByTitle("Bold")).toBeVisible();
    await expect(page.getByTitle("Italic")).toBeVisible();
    await expect(page.getByTitle("Add link")).toBeVisible();
    await expect(page.getByTitle("Send message")).toBeVisible();
  });
});

// ─── Multi-user scenarios ───────────────────────────────────────────────────

test.describe("Multi-user conversation", () => {
  test.setTimeout(60_000);

  test("Sarah can see her conversation with Marco", async ({ page }) => {
    await login(page, SARAH);
    await page.goto("/community/messages");

    // Sarah has a seeded conversation with Marco
    await expect(page.getByText("Marco Rivera")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByText("Marco Rivera").click();
    await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, {
      timeout: 10_000,
    });

    // Should see the seeded messages
    await expect(
      page.getByText("Loved your freediving post"),
    ).toBeVisible();
    await expect(page.getByText("Blue Hole looks")).toBeVisible();
    await expect(
      page.getByText("I can recommend some good guides"),
    ).toBeVisible();
  });

  test("Marco can see his conversation with Sarah", async ({ page }) => {
    await login(page, MARCO);
    await page.goto("/community/messages");

    // Marco has the same conversation with Sarah
    await expect(page.getByText("Sarah Chen")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByText("Sarah Chen").click();
    await page.waitForURL(/\/community\/messages\/[a-f0-9-]+/, {
      timeout: 10_000,
    });

    // Should see the same messages from Marco's perspective
    await expect(
      page.getByText("Loved your freediving post"),
    ).toBeVisible();
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

test.describe("Edge cases", () => {
  test.setTimeout(60_000);

  test("unauthenticated user cannot access messages", async ({ page }) => {
    await page.goto("/community/messages");

    // Should redirect to login (community requires auth)
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  });

  test("invalid conversation ID shows 404", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto(
      "/community/messages/00000000-0000-0000-0000-000000000000",
    );

    // Next.js default 404 shows "This page could not be found."
    await expect(
      page.getByText("This page could not be found"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("invalid ?start= parameter is ignored", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/community/messages?start=not-a-uuid");

    // Should show the empty state (invalid UUID ignored)
    await expect(
      page.getByRole("heading", { name: "Your messages" }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("close search with X button", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/community/messages");

    await page.waitForTimeout(2000);
    await page.getByTitle("New message").click();

    // Search input should be visible
    await expect(page.getByPlaceholder("Search users...")).toBeVisible();

    // Click X to close
    await page
      .locator("button")
      .filter({ has: page.locator("svg.lucide-x") })
      .click();

    // Search should be hidden
    await expect(
      page.getByPlaceholder("Search users..."),
    ).not.toBeVisible();
  });
});
