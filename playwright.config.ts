import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local manually (Playwright doesn't auto-load Next.js env files)
try {
  const content = readFileSync(
    resolve(process.cwd(), ".env.local"),
    "utf-8",
  );
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1).replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    if (
      !process.env.CI &&
      (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
        !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    ) {
      throw new Error(
        "Missing .env.local — create it with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      );
    }
    // CI: env vars are set via GitHub secrets, file not needed
  } else {
    throw new Error(
      `Failed to load .env.local: ${error instanceof Error ? error.message : error}`,
    );
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },

  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      SUPABASE_LOCAL_SERVICE_ROLE_KEY:
        process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ?? "",
      EMAIL_PROVIDER: "fake",
      OWNER_EMAIL_FORWARD_TO:
        process.env.OWNER_EMAIL_FORWARD_TO ?? "owner@behind-the-mask.com",
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
