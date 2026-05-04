import { test, expect } from "@playwright/test";

test.describe("CMS pages", () => {
  test("films page loads", async ({ page }) => {
    await page.goto("/films");
    await expect(
      page.getByRole("heading", {
        name: /stories captured beneath the surface|films/i,
        level: 1,
      }),
    ).toBeVisible();

    const emptyState = page.getByText(/our film portfolio is coming soon/i);
    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible();
      return;
    }

    const search = page.getByLabel("Search films");
    await expect(search).toBeVisible();
    await expect(page.getByRole("button", { name: /filters/i })).toBeVisible();
  });

  test("films page filter controls remain usable", async ({ page }) => {
    await page.goto("/films");

    const search = page.getByLabel("Search films");
    if ((await search.count()) === 0) {
      test.skip(true, "No Sanity films are available in this environment.");
    }

    await search.fill("unlikely-search-value-no-films");

    await expect(page.getByText(/no films match your search/i)).toBeVisible();
    await page
      .getByRole("button", { name: /reset search and filters/i })
      .click();
    await expect(search).toHaveValue("");

    await page.getByRole("button", { name: /filters/i }).click();
    await expect(
      page.getByRole("dialog", { name: /filter films/i }),
    ).toBeVisible();
  });

  test("films page opens and closes the playback modal", async ({ page }) => {
    await page.goto("/films");

    const playButtons = page.getByRole("button", { name: /play .+/i });
    if ((await playButtons.count()) === 0) {
      test.skip(true, "No Sanity films are available in this environment.");
    }

    await playButtons.first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog
        .getByRole("link", { name: /more details/i })
        .or(dialog.getByText(/video unavailable/i)),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
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
