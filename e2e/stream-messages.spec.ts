import { expect, test, type Page } from "@playwright/test";

const STREAM_E2E_USER = {
  email: process.env.STREAM_E2E_USER_EMAIL ?? "",
  password: process.env.STREAM_E2E_USER_PASSWORD ?? "",
};
const STREAM_E2E_RECIPIENT_ID = process.env.STREAM_E2E_RECIPIENT_ID ?? "";

const canRunStreamE2E =
  STREAM_E2E_USER.email.length > 0 &&
  STREAM_E2E_USER.password.length > 0 &&
  STREAM_E2E_RECIPIENT_ID.length > 0;

test.skip(
  !canRunStreamE2E,
  "Set STREAM_E2E_USER_EMAIL, STREAM_E2E_USER_PASSWORD, and STREAM_E2E_RECIPIENT_ID to run Stream Chat smoke tests.",
);

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
}

test.describe("Stream messages", () => {
  test.setTimeout(60_000);

  test("starts a direct Stream channel and keeps the messages UI mounted", async ({
    page,
  }) => {
    await login(page, STREAM_E2E_USER);
    await page.goto(`/community/messages?start=${STREAM_E2E_RECIPIENT_ID}`);

    await expect(page.locator(".stream-chat-shell")).toBeVisible({
      timeout: 20_000,
    });
    await page.waitForURL(/\/community\/messages\?thread=[a-f0-9-]+/, {
      timeout: 20_000,
    });
    await expect(page.getByText("Messages are unavailable")).toHaveCount(0);
  });
});
