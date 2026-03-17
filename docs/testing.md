# Testing Guide — BTM Hub

## Overview

The project uses two testing tools:

- **Vitest** — unit and integration tests (fast, runs in Node.js)
- **Playwright** — end-to-end browser tests (runs a real browser against the app)

All unit/integration tests are co-located next to the source files they test (`foo.ts` -> `foo.test.ts`). E2E tests live in the `e2e/` directory at the project root.

---

## Commands

| Command | What it does |
|---------|-------------|
| `npm test` | Run unit tests in **watch mode** (re-runs on file changes) |
| `npm run test:unit` | Run unit tests **once** (CI-friendly) |
| `npm run test:e2e` | Run E2E tests with Playwright |
| `npm run test:ci` | Run unit tests + E2E tests sequentially |

---

## What was set up

### 1. Test infrastructure files

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest configuration — sets `@/` path alias, node environment, setup file |
| `playwright.config.ts` | Playwright configuration — runs `npm run build && npm run start` before E2E tests |
| `src/test/setup.ts` | Runs before every test file. Sets dummy Supabase env vars so server-side imports don't crash |
| `src/test/mocks/supabase.ts` | Reusable Supabase mock factory used across all server-side tests |

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

### 3. E2E test placeholder

| File | Purpose |
|------|---------|
| `e2e/smoke.spec.ts` | Visits homepage and checks the title contains "BTM". Ready for expansion once a test Supabase environment is configured |

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

## How Supabase mocking works

Server-side code (`actions.ts`, data fetchers) calls `await createClient()` from `@/lib/supabase/server` to get a Supabase client. In tests, we mock this module so it returns a fake client instead.

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

## Setting up Supabase for E2E tests

E2E tests need a real Supabase instance to run against. You have two options:

### Option A: Local Supabase (recommended)

Local Supabase runs Postgres, Auth, Storage, etc. in Docker containers on your machine. It's hermetic (no shared state) and free.

**Prerequisites:** Docker Desktop must be running.

**Steps:**

1. Install the Supabase CLI:
   ```bash
   brew install supabase/tap/supabase
   ```

2. Initialize Supabase in the project (if not already done):
   ```bash
   supabase init
   ```
   This creates a `supabase/` directory with config and migration files.

3. If you already have a remote Supabase project, pull the schema:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db pull
   ```
   This downloads your production schema as migration files into `supabase/migrations/`.

4. Start the local instance:
   ```bash
   supabase start
   ```
   This prints the local URLs and keys:
   ```
   API URL:   http://127.0.0.1:54321
   anon key:  eyJhbGciOiJIUzI1NiIs...
   ```

5. Create a `.env.test.local` file (already gitignored by the `.env*` pattern):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon-key-from-step-4>
   ```

6. Seed test data (create a seed file if needed):
   ```bash
   supabase db seed
   ```
   Or create `supabase/seed.sql` with test users and applications.

7. Run E2E tests:
   ```bash
   npm run test:e2e
   ```

8. Stop when done:
   ```bash
   supabase stop
   ```

### Option B: Remote test project

Use a separate Supabase project dedicated to testing (never your production project).

1. Create a new project at [supabase.com](https://supabase.com)
2. Apply the same schema (run your migrations or manually replicate tables)
3. Create test users via the Supabase dashboard or Auth API
4. Set the URL and anon key in `.env.test.local`
5. Run E2E tests

**Downside:** Tests share state, so you need cleanup between runs and can't run tests in parallel from multiple machines.

### Enabling E2E in CI

Once your test environment is ready:

1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. Add **repository secrets**:
   - `NEXT_PUBLIC_SUPABASE_URL` — your test Supabase URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — your test anon key
3. Add a **repository variable**:
   - `RUN_E2E` = `true`

The E2E job in CI will now run. If `RUN_E2E` is not set, the job is skipped entirely (clearly shown in the GitHub Actions UI, not silently skipped).

For local Supabase in CI, you would need to add `supabase start` as a step in the workflow and use Docker-in-Docker. The current CI config is set up for a remote test project — if you want local Supabase in CI, that's a follow-up change.

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
├── playwright.config.ts          # Playwright configuration
├── .github/workflows/ci.yml     # CI pipeline (lint + typecheck + test + build + e2e)
├── e2e/
│   └── smoke.spec.ts             # E2E smoke test
├── src/
│   ├── test/
│   │   ├── setup.ts              # Global test setup (env vars)
│   │   └── mocks/
│   │       └── supabase.ts       # Reusable Supabase mock factory
│   ├── lib/
│   │   ├── validation-helpers.ts         # Extracted UUID validation (new)
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
