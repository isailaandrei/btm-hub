# Testing Guide — BTM Hub

## Overview

The project uses two testing tools:

- **Vitest** — unit and integration tests (fast, runs in Node.js, no browser)
- **Playwright** — end-to-end browser tests (launches a real browser against the running app)

All unit/integration tests are co-located next to the source files they test (`foo.ts` -> `foo.test.ts`). E2E tests live in the `e2e/` directory at the project root.

---

## Commands

### Unit Tests (Vitest)

| Command | What it does |
|---------|-------------|
| `npm test` | Run unit tests in **watch mode** (re-runs on file changes) |
| `npm run test:unit` | Run unit tests **once** (CI-friendly) |

### E2E Tests (Playwright)

| Command | What it does |
|---------|-------------|
| `npm run test:e2e` | Run E2E tests **headless** (no browser window, fast) |
| `npx playwright test --headed` | Run E2E tests with a **visible browser window** — watch tests click through the app |
| `npx playwright test --ui` | Open Playwright's **interactive UI** — step through tests, see screenshots at each step, inspect DOM |
| `npx playwright test --debug` | Run in **debug mode** — pauses at each step, lets you inspect the page |
| `npx playwright test e2e/auth.spec.ts` | Run a **single test file** |
| `npx playwright test --grep "can log in"` | Run tests **matching a name** |
| `npx playwright show-report` | Open the **HTML report** from the last run |

### Combined

| Command | What it does |
|---------|-------------|
| `npm run test:ci` | Run unit tests + E2E tests sequentially |

---

## How E2E Tests Work

Playwright launches a **real Chromium browser** (headless by default — no visible window, but it renders HTML, executes JavaScript, applies CSS, handles cookies — everything a real user's browser does). It is not simulating — it is automating a real browser.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          YOUR MACHINE                               │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  1. PLAYWRIGHT TEST RUNNER  (npx playwright test)             │  │
│  │                                                               │  │
│  │  Reads e2e/*.spec.ts files                                    │  │
│  │  Launches Chromium (headless by default)                      │  │
│  │  Sends commands: "goto /login", "fill email", "click"         │  │
│  │  Asserts results: "expect URL to be /profile"                 │  │
│  └────────────────┬──────────────────────────────────────────────┘  │
│                   │                                                 │
│                   │ Controls via CDP (Chrome DevTools Protocol)      │
│                   ▼                                                 │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  2. CHROMIUM BROWSER  (headless — real rendering engine)      │  │
│  │                                                               │  │
│  │  Renders pages exactly like a user's browser                  │  │
│  │  Executes React, handles cookies, runs JS                    │  │
│  │  Makes HTTP requests to the Next.js app ──────────────────┐  │  │
│  └───────────────────────────────────────────────────────────┼──┘  │
│                                                              │     │
│                   ┌──────────────────────────────────────────┘     │
│                   ▼                                                │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  3. NEXT.JS APP  (http://localhost:3000)                      │  │
│  │                                                               │  │
│  │  Started automatically by Playwright via webServer config:    │  │
│  │    command: "npm run build && npm run start"                   │  │
│  │    Playwright waits until localhost:3000 responds before       │  │
│  │    running any tests.                                         │  │
│  │                                                               │  │
│  │  If you already have a dev server on :3000, Playwright        │  │
│  │  reuses it (locally) instead of building.                     │  │
│  │                                                               │  │
│  │  Env vars point to LOCAL Supabase (from .env.test.local):     │  │
│  │    NEXT_PUBLIC_SUPABASE_URL = http://127.0.0.1:54321          │  │
│  │                                                               │  │
│  │  Server components, server actions, proxy — all real.         │  │
│  │  Makes API calls to local Supabase ───────────────────────┐   │  │
│  └───────────────────────────────────────────────────────────┼───┘  │
│                                                              │      │
│                   ┌──────────────────────────────────────────┘      │
│                   ▼                                                 │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  4. LOCAL SUPABASE  (Docker containers via `supabase start`)  │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐       │  │
│  │  │  PostgreSQL  │  │  GoTrue Auth │  │  PostgREST API │       │  │
│  │  │  :54322      │  │  (auth)      │  │  (queries)     │       │  │
│  │  │              │  │              │  │                │       │  │
│  │  │  Your real   │  │  Handles     │  │  Handles       │       │  │
│  │  │  schema:     │  │  login,      │  │  .from()       │       │  │
│  │  │  - profiles  │  │  signup,     │  │  .select()     │       │  │
│  │  │  - apps      │  │  sessions,   │  │  .insert()     │       │  │
│  │  │  - shares    │  │  cookies     │  │  .update()     │       │  │
│  │  └──────────────┘  └──────────────┘  └────────────────┘       │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌──────────────┐                            │  │
│  │  │  Kong API    │  │   Mailpit    │                            │  │
│  │  │  Gateway     │  │   :54324     │                            │  │
│  │  │  :54321      │  │              │                            │  │
│  │  │              │  │  Catches all │                            │  │
│  │  │  Single      │  │  emails for  │                            │  │
│  │  │  entry point │  │  inspection  │                            │  │
│  │  │  for all API │  │  (no real    │                            │  │
│  │  │  requests    │  │  emails sent)│                            │  │
│  │  └──────────────┘  └──────────────┘                            │  │
│  │                                                               │  │
│  │  Seeded with test users (via supabase/seed.sql):              │  │
│  │    test@btmhub.com  / TestPass123   (member)                  │  │
│  │    admin@btmhub.com / AdminPass123  (admin)                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### The Flow, Step by Step

When you run `npx playwright test`:

1. **Reads `playwright.config.ts`** — loads `.env.test.local` to get the local Supabase URL and key.

2. **Starts your Next.js app** (the `webServer` config) — runs `npm run build && npm run start` with the local Supabase env vars. Waits until `http://localhost:3000` responds. If you already have a dev server running locally, it reuses that instead.

3. **Launches headless Chromium** — a real browser, just without a visible window.

4. **Executes each test** — Playwright drives the browser like a user:
   - `page.goto("/login")` — browser navigates to your login page
   - `page.getByLabel(/email/i).fill("test@btmhub.com")` — types into the input
   - `page.getByRole("button").click()` — clicks the button
   - Your Next.js server action runs, calls Supabase Auth in Docker, sets cookies
   - `page.waitForURL("**/profile")` — waits for the redirect
   - `expect(page).toHaveURL(/\/profile/)` — asserts the browser is on the right page

5. **Everything is real** — the browser renders real HTML/CSS, React hydrates, server actions talk to a real Postgres database running in Docker. The only difference from production is the Supabase instance is local.

This is why E2E tests catch bugs that unit tests can't: broken layouts, failed redirects, auth cookie issues, missing form fields, client/server mismatches.

### The `webServer` config

```typescript
// playwright.config.ts
webServer: {
  command: "npm run build && npm run start",  // builds then starts your Next.js app
  url: "http://localhost:3000",               // Playwright polls this until it responds
  reuseExistingServer: !process.env.CI,       // locally: reuses if already running
  timeout: 120_000,                           // waits up to 2 min for the app to start
  env: {                                      // passes local Supabase env vars to the app
    NEXT_PUBLIC_SUPABASE_URL: ...,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ...,
  },
},
```

---

## What was set up

### 1. Test infrastructure files

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest configuration — sets `@/` path alias, node environment, setup file |
| `playwright.config.ts` | Playwright configuration — loads `.env.test.local`, starts Next.js app, configures Chromium |
| `src/test/setup.ts` | Runs before every unit test file. Sets dummy Supabase env vars so server-side imports don't crash |
| `src/test/mocks/supabase.ts` | Reusable Supabase mock factory used across all server-side unit tests |
| `supabase/seed.sql` | Seeds the local Supabase DB with test users (member + admin) |
| `.env.test.local` | Local Supabase URL and key for E2E tests (gitignored) |

### 2. Unit test files (98 tests total)

#### Pure logic tests (no mocking needed)

| File | Tests | What it covers |
|------|-------|---------------|
| `src/lib/validations/auth.test.ts` | 15 | `loginSchema`, `registerSchema`, `profileSchema` — validates email formats, password rules, display name length, bio limits |
| `src/lib/academy/forms/schema-builder.test.ts` | 15 | `buildStepSchema`, `buildFullSchema` — all field types (text, select, multiselect, rating, date), required vs optional, email validation, string arrays, minLength |
| `src/lib/data/applications.test.ts` | 14 | `getApplicantName` (name assembly from answers), `escapeSearchTerm` (SQL injection prevention for ILIKE queries) |
| `src/lib/validation-helpers.test.ts` | 10 | `isUUID` and `validateUUID` — UUID format validation used by admin actions |

#### Server action tests (mock Supabase + Next.js)

| File | Tests | What it covers |
|------|-------|---------------|
| `src/app/(auth)/actions.test.ts` | 10 | `login` — validation errors, auth failure message, redirect on success, open redirect prevention (`//evil.com` rejected). `register` — validation, "already registered" handling, redirect to confirmation |
| `src/app/(dashboard)/admin/applications/actions.test.ts` | 10 | `changeStatus` — UUID validation gate, delegates to data layer. `addTag` — trims, truncates to 50 chars, skips empty. `addNote` — passes admin profile info, trims, skips empty |
| `src/app/(dashboard)/profile/actions.test.ts` | 7 | `updateProfile` — auth check, validation errors, success/failure. `uploadAvatar` — auth check, missing file, 2MB size limit, MIME type whitelist, upload failure, success |
| `src/app/(marketing)/academy/[program]/apply/actions.test.ts` | 5 | `submitAcademyApplication` — invalid program, closed program, validation errors, DB failure handling, redirect to success page |

#### Proxy/middleware tests

| File | Tests | What it covers |
|------|-------|---------------|
| `src/lib/supabase/proxy.test.ts` | 10 | `updateSession` — unauthenticated users redirected from `/profile`, `/admin`, `/dashboard`, `/settings` to `/login`. Authenticated users redirected from `/login`, `/register` to `/profile`. Public routes pass through for both |

### 3. E2E test files (12 tests total)

| File | Tests | What it covers |
|------|-------|---------------|
| `e2e/smoke.spec.ts` | 1 | Homepage loads with correct title |
| `e2e/auth.spec.ts` | 5 | Login validation errors, wrong credentials error, successful login + redirect to profile, unauthenticated redirect to login, authenticated redirect from login to profile |
| `e2e/academy.spec.ts` | 4 | Academy page lists programs, navigate to application form, form shows first step, form validates required fields |
| `e2e/admin.spec.ts` | 2 | Regular user cannot access admin, admin user can access admin dashboard |

### 4. Small refactors made

Two pieces of logic were extracted from inline code into testable, exported functions:

- **`escapeSearchTerm()`** — was inline in `getApplications()` in `src/lib/data/applications.ts`. Now an exported function in the same file, called by `getApplications()`.
- **`validateUUID()` / `isUUID()`** — was a private `validateId()` function inside admin actions. Now lives in `src/lib/validation-helpers.ts` and is imported by the admin actions.

### 5. CI pipeline

**`.github/workflows/ci.yml`** runs on every push to `main` and every PR:

```
Parallel:
  - Lint (eslint)
  - Type Check (tsc --noEmit)
  - Unit Tests (vitest run)
      |
      v
Sequential:
  - Build (next build)
      |
      v
  - E2E Tests (playwright) — only if RUN_E2E=true is set
```

Lint, typecheck, and unit tests run in parallel for fast feedback. Build only runs after all three pass. E2E is conditional — see below.

---

## How Supabase mocking works (unit tests)

Server-side code (`actions.ts`, data fetchers) calls `await createClient()` from `@/lib/supabase/server` to get a Supabase client. In unit tests, we mock this module so it returns a fake client instead.

The mock factory (`src/test/mocks/supabase.ts`) provides:

```typescript
const mockSupabase = createMockSupabaseClient();

// Mock the module
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase.client),
}));

// Control what queries return
mockSupabase.mockQueryResult({ id: "123" }, null);

// Control auth state
mockSupabase.auth.getUser.mockResolvedValue({
  data: { user: { id: "user-1" } },
  error: null,
});

// Control storage
mockSupabase.storage.upload.mockResolvedValue({ data: {}, error: null });
```

The mock client supports chainable queries (`.from("x").select("*").eq("id", 1).single()`) by returning itself from every method.

### Mocking `redirect()`

Next.js `redirect()` does **not** return — it throws a special error to halt execution. Tests must catch this:

```typescript
class RedirectError extends Error {
  url: string;
  constructor(url: string) {
    super(`NEXT_REDIRECT: ${url}`);
    this.url = url;
  }
}

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new RedirectError(url); }),
}));

// In a test:
try {
  await login(prevState, formData);
} catch (e) {
  expect((e as RedirectError).url).toBe("/profile");
}
```

---

## Setting up local Supabase for E2E tests

Local Supabase runs Postgres, Auth, and the API gateway in Docker containers on your machine. It's hermetic (no shared state) and free.

**Prerequisites:** Docker Desktop must be running.

**Steps:**

1. Install the Supabase CLI:
   ```bash
   brew install supabase/tap/supabase
   ```

2. Start the local instance:
   ```bash
   supabase start
   ```
   This prints the local URLs and keys. Copy the **Publishable** key.

3. Update `.env.test.local` with the values from step 2:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key-from-step-2>
   ```

4. Seed the database with test users:
   ```bash
   supabase db reset
   ```
   This applies migrations + runs `supabase/seed.sql`, which creates:
   - `test@btmhub.com` / `TestPass123` (regular member)
   - `admin@btmhub.com` / `AdminPass123` (admin)

5. Run E2E tests:
   ```bash
   npm run test:e2e
   ```

6. Stop when done:
   ```bash
   supabase stop
   ```

### Apple Silicon note

Some Supabase Docker images (gotrue, storage-api) have broken ARM binaries. If `supabase start` fails with `exec format error`, pull the x86 image manually — Docker Rosetta will emulate it:

```bash
docker image rm public.ecr.aws/supabase/gotrue:v2.187.0
docker pull --platform linux/amd64 public.ecr.aws/supabase/gotrue:v2.187.0
supabase start
```

### Enabling E2E in CI

1. Go to your GitHub repo -> Settings -> Secrets and variables -> Actions
2. Add **repository secrets**:
   - `NEXT_PUBLIC_SUPABASE_URL` — your test Supabase URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — your test publishable key
3. Add a **repository variable**:
   - `RUN_E2E` = `true`

The E2E job in CI will now run. If `RUN_E2E` is not set, the job is skipped entirely (clearly shown in GitHub Actions UI).

---

## Writing new tests

### Unit test for pure logic

```typescript
// src/lib/my-helper.test.ts
import { describe, it, expect } from "vitest";
import { myFunction } from "./my-helper";

describe("myFunction", () => {
  it("does the thing", () => {
    expect(myFunction("input")).toBe("expected");
  });
});
```

### Unit test for a server action

```typescript
// src/app/(feature)/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

const mockSupabase = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase.client),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Import AFTER mocks
const { myAction } = await import("./actions");

describe("myAction", () => {
  beforeEach(() => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockSupabase.mockQueryResult({ id: "123" }, null);
  });

  it("works", async () => {
    const result = await myAction(/* args */);
    expect(result.success).toBe(true);
  });
});
```

### E2E test

```typescript
// e2e/my-feature.spec.ts
import { test, expect } from "@playwright/test";

test("user can do the thing", async ({ page }) => {
  await page.goto("/some-page");
  await page.getByRole("button", { name: "Click me" }).click();
  await expect(page.getByText("Success")).toBeVisible();
});
```

---

## File map

```
btm-hub/
├── vitest.config.ts              # Vitest configuration
├── playwright.config.ts          # Playwright configuration (loads .env.test.local)
├── .env.test.local               # Local Supabase URL + key (gitignored)
├── .github/workflows/ci.yml     # CI pipeline (lint + typecheck + test + build + e2e)
├── e2e/
│   ├── smoke.spec.ts             # Homepage smoke test
│   ├── auth.spec.ts              # Auth flow E2E tests
│   ├── academy.spec.ts           # Academy page E2E tests
│   └── admin.spec.ts             # Admin access control E2E tests
├── supabase/
│   ├── config.toml               # Local Supabase config
│   ├── seed.sql                  # Test users (member + admin)
│   └── migrations/               # DB schema (pulled from remote)
├── src/
│   ├── test/
│   │   ├── setup.ts              # Global test setup (env vars)
│   │   └── mocks/
│   │       └── supabase.ts       # Reusable Supabase mock factory
│   ├── lib/
│   │   ├── validation-helpers.ts         # Extracted UUID validation
│   │   ├── validation-helpers.test.ts    # Tests for UUID validation
│   │   ├── validations/
│   │   │   └── auth.test.ts              # Zod schema tests
│   │   ├── data/
│   │   │   └── applications.test.ts      # Helper function tests
│   │   ├── academy/forms/
│   │   │   └── schema-builder.test.ts    # Schema builder tests
│   │   └── supabase/
│   │       └── proxy.test.ts             # Proxy/middleware tests
│   └── app/
│       ├── (auth)/
│       │   └── actions.test.ts           # Login/register action tests
│       ├── (dashboard)/
│       │   ├── admin/applications/
│       │   │   └── actions.test.ts       # Admin action tests
│       │   └── profile/
│       │       └── actions.test.ts       # Profile action tests
│       └── (marketing)/academy/[program]/apply/
│           └── actions.test.ts           # Application submission tests
```
