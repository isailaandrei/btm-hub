# Profile Picture Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated-member profile portfolios with resumable image uploads, public member gallery display, and admin contact review visibility.

**Architecture:** Store image files in a private Supabase Storage bucket and store display/edit metadata in `profile_portfolio_items`. Uploads go directly from the browser to Supabase using TUS resumable upload, then a server action verifies the object, records metadata, enforces a 50-image per-profile v1 limit, and revalidates affected profile/admin pages. Server data fetchers generate short-lived signed URLs with the service-role admin client after app-level access checks.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Postgres/RLS/Storage, `@supabase/ssr`, `@supabase/supabase-js`, `tus-js-client`, Tailwind CSS 4, Vitest, Playwright.

---

## File Structure

- Create `supabase/migrations/20260506000001_profile_portfolio.sql`: table, bucket, RLS/storage policies, profile visibility policy change, contact/profile email backfill, and helper RPC for logged-in contact linking.
- Modify `src/types/database.ts`: add `ProfilePortfolioItem` and signed display type.
- Create `src/lib/storage/profile-portfolio.ts`: shared MIME/extension/path/upload endpoint helpers.
- Create `src/lib/storage/profile-portfolio.test.ts`: helper tests.
- Create `src/lib/data/profile-portfolio.ts`: server fetchers for portfolio rows with signed URLs.
- Create `src/lib/data/profile-portfolio.test.ts`: fetcher and signed URL failure tests.
- Modify `src/test/mocks/supabase.ts`: add storage methods used by portfolio tests.
- Create `src/components/profile/portfolio-gallery.tsx`: read-only gallery shared by community/admin surfaces.
- Create `src/app/(dashboard)/profile/portfolio/actions.ts`: metadata create/update/delete actions.
- Create `src/app/(dashboard)/profile/portfolio/actions.test.ts`: action auth/ownership/validation tests.
- Create `src/app/(dashboard)/profile/portfolio/portfolio-uploader.tsx`: client upload and management UI.
- Create `src/app/(dashboard)/profile/portfolio/page.tsx`: owner management page.
- Modify `src/app/(dashboard)/profile/profile-sidebar.tsx`: add Portfolio nav item and icon.
- Modify `src/app/(marketing)/community/members/[id]/page.tsx`: fetch and render gallery below bio.
- Modify `src/app/(dashboard)/admin/contacts/[id]/page.tsx`: fetch and render right-rail portfolio card.
- Modify `src/lib/data/contacts.ts`: add profile/contact lookup and linking helpers backed by RPCs.
- Modify `src/app/(marketing)/academy/[program]/apply/actions.ts`: link logged-in applicants' contacts to profiles without overwriting existing links.
- Modify `src/app/(marketing)/academy/[program]/apply/actions.test.ts`: contact/profile linking tests.
- Add `e2e/profile-portfolio.spec.ts`: authenticated visibility, upload smoke, and admin display coverage.
- Modify `package.json` and `package-lock.json`: add `tus-js-client`.

---

### Task 1: Add Dependency and Storage Helpers

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/storage/profile-portfolio.ts`
- Create: `src/lib/storage/profile-portfolio.test.ts`

- [ ] **Step 1: Install the TUS client**

Run:

```bash
npm install tus-js-client
```

Expected: command exits 0 and updates `package.json` plus `package-lock.json`. `tus-js-client` version `4.3.1` includes `./lib/index.d.ts`, so no `@types` package is needed.

- [ ] **Step 2: Write failing helper tests**

Create `src/lib/storage/profile-portfolio.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_PORTFOLIO_IMAGE_TYPES,
  extensionForPortfolioMimeType,
  getProfilePortfolioUploadEndpoint,
  isAllowedPortfolioImageType,
  portfolioStoragePath,
} from "./profile-portfolio";

describe("profile portfolio storage helpers", () => {
  it("allows only JPEG, PNG, and WebP", () => {
    expect([...ALLOWED_PORTFOLIO_IMAGE_TYPES]).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    expect(isAllowedPortfolioImageType("image/jpeg")).toBe(true);
    expect(isAllowedPortfolioImageType("image/png")).toBe(true);
    expect(isAllowedPortfolioImageType("image/webp")).toBe(true);
    expect(isAllowedPortfolioImageType("image/heic")).toBe(false);
    expect(isAllowedPortfolioImageType("image/gif")).toBe(false);
  });

  it("maps allowed MIME types to stable extensions", () => {
    expect(extensionForPortfolioMimeType("image/jpeg")).toBe("jpg");
    expect(extensionForPortfolioMimeType("image/png")).toBe("png");
    expect(extensionForPortfolioMimeType("image/webp")).toBe("webp");
    expect(() => extensionForPortfolioMimeType("image/heic")).toThrow(
      "Unsupported portfolio image type",
    );
  });

  it("creates owner-scoped unique storage paths", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(portfolioStoragePath("profile-1", "image/png")).toBe(
      "profile-1/11111111-1111-4111-8111-111111111111.png",
    );
  });

  it("uses local Supabase storage endpoint for localhost", () => {
    expect(
      getProfilePortfolioUploadEndpoint("http://127.0.0.1:54321"),
    ).toBe("http://127.0.0.1:54321/storage/v1/upload/resumable");
  });

  it("uses direct storage hostname for hosted Supabase", () => {
    expect(
      getProfilePortfolioUploadEndpoint("https://abcxyz.supabase.co"),
    ).toBe("https://abcxyz.storage.supabase.co/storage/v1/upload/resumable");
  });
});
```

- [ ] **Step 3: Run helper tests and verify they fail**

Run:

```bash
npm run test:unit -- src/lib/storage/profile-portfolio.test.ts
```

Expected: fail with missing module or missing exports from `src/lib/storage/profile-portfolio.ts`.

- [ ] **Step 4: Implement storage helpers**

Create `src/lib/storage/profile-portfolio.ts`:

```ts
export const PROFILE_PORTFOLIO_BUCKET = "profile-portfolio";

export const ALLOWED_PORTFOLIO_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PortfolioImageMimeType =
  (typeof ALLOWED_PORTFOLIO_IMAGE_TYPES)[number];

const ALLOWED_TYPE_SET = new Set<string>(ALLOWED_PORTFOLIO_IMAGE_TYPES);

export function isAllowedPortfolioImageType(
  type: string,
): type is PortfolioImageMimeType {
  return ALLOWED_TYPE_SET.has(type);
}

export function extensionForPortfolioMimeType(type: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  throw new Error(`Unsupported portfolio image type: ${type}`);
}

export function portfolioStoragePath(profileId: string, mimeType: string) {
  const ext = extensionForPortfolioMimeType(mimeType);
  return `${profileId}/${crypto.randomUUID()}.${ext}`;
}

export function storagePathBelongsToProfile(
  storagePath: string,
  profileId: string,
) {
  return storagePath.startsWith(`${profileId}/`) && !storagePath.includes("..");
}

export function getProfilePortfolioUploadEndpoint(supabaseUrl: string) {
  const url = new URL(supabaseUrl);
  if (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1"
  ) {
    return `${url.origin}/storage/v1/upload/resumable`;
  }

  const projectRef = url.hostname.replace(".supabase.co", "");
  return `${url.protocol}//${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
}
```

- [ ] **Step 5: Run helper tests and commit**

Run:

```bash
npm run test:unit -- src/lib/storage/profile-portfolio.test.ts
```

Expected: pass.

Commit:

```bash
git add package.json package-lock.json src/lib/storage/profile-portfolio.ts src/lib/storage/profile-portfolio.test.ts
git commit -m "feat: add profile portfolio storage helpers"
```

---

### Task 2: Add Database Schema, RLS, and Types

**Files:**
- Create: `supabase/migrations/20260506000001_profile_portfolio.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Create migration**

Create `supabase/migrations/20260506000001_profile_portfolio.sql`:

```sql
CREATE TABLE IF NOT EXISTS profile_portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  title text,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_portfolio_items_mime_type_check
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT profile_portfolio_items_size_bytes_check CHECK (size_bytes > 0),
  CONSTRAINT profile_portfolio_items_title_check
    CHECK (title IS NULL OR char_length(title) <= 120),
  CONSTRAINT profile_portfolio_items_caption_check
    CHECK (caption IS NULL OR char_length(caption) <= 1000),
  CONSTRAINT profile_portfolio_items_storage_owner_check
    CHECK ((storage.foldername(storage_path))[1] = profile_id::text)
);

CREATE INDEX IF NOT EXISTS idx_profile_portfolio_items_profile_order
  ON profile_portfolio_items (profile_id, sort_order, created_at DESC);

ALTER TABLE profile_portfolio_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read portfolio items"
  ON profile_portfolio_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own portfolio items"
  ON profile_portfolio_items FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update own portfolio items"
  ON profile_portfolio_items FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can delete own portfolio items"
  ON profile_portfolio_items FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES (
  'profile-portfolio',
  'profile-portfolio',
  false,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  file_size_limit = NULL;

CREATE POLICY "Users can read own profile portfolio objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'profile-portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can upload own profile portfolio objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own profile portfolio objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

UPDATE contacts c
SET profile_id = p.id,
    updated_at = now()
FROM profiles p
WHERE c.profile_id IS NULL
  AND lower(trim(c.email)) = lower(trim(p.email));

CREATE OR REPLACE FUNCTION link_contact_to_profile_if_unset(
  p_contact_id uuid,
  p_profile_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked boolean := false;
BEGIN
  IF p_profile_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot link contact to another profile'
      USING ERRCODE = '42501';
  END IF;

  UPDATE contacts c
  SET profile_id = p_profile_id,
      updated_at = now()
  FROM profiles p
  WHERE c.id = p_contact_id
    AND p.id = p_profile_id
    AND c.profile_id IS NULL
    AND lower(trim(c.email)) = lower(trim(p.email))
  RETURNING true INTO v_linked;

  RETURN coalesce(v_linked, false);
END;
$$;

GRANT EXECUTE ON FUNCTION link_contact_to_profile_if_unset(uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION contact_ids_for_profile(
  p_profile_id uuid
) RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(id ORDER BY created_at DESC), ARRAY[]::uuid[])
  FROM contacts
  WHERE profile_id = p_profile_id
    AND (
      p_profile_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
      )
    );
$$;

GRANT EXECUTE ON FUNCTION contact_ids_for_profile(uuid) TO authenticated;
```

- [ ] **Step 2: Add database type**

Modify `src/types/database.ts` below the `Profile` interface:

```ts
export type PortfolioImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface ProfilePortfolioItem {
  id: string;
  profile_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: PortfolioImageMimeType;
  size_bytes: number;
  title: string | null;
  caption: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProfilePortfolioItemWithUrl extends ProfilePortfolioItem {
  signedUrl: string | null;
  imageError: string | null;
}
```

- [ ] **Step 3: Apply migration locally**

Run:

```bash
supabase migration up
```

Expected: migration applies without SQL errors.

- [ ] **Step 4: Run schema smoke checks**

Run:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select policyname from pg_policies where tablename in ('profiles', 'profile_portfolio_items') order by tablename, policyname;"
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select proname, pg_get_function_result(oid) from pg_proc where proname in ('link_contact_to_profile_if_unset', 'contact_ids_for_profile') order by proname;"
```

Expected:

```text
Profiles are viewable by authenticated users
Authenticated users can read portfolio items
Users can insert own portfolio items
Users can update own portfolio items
Users can delete own portfolio items
contact_ids_for_profile | uuid[]
link_contact_to_profile_if_unset | boolean
```

- [ ] **Step 5: Verify typecheck through unit compile path and commit**

Run:

```bash
npm run test:unit -- src/lib/storage/profile-portfolio.test.ts
```

Expected: pass.

Commit:

```bash
git add supabase/migrations/20260506000001_profile_portfolio.sql src/types/database.ts
git commit -m "feat: add profile portfolio schema"
```

---

### Task 3: Add Portfolio Data Fetchers with Signed URLs

**Files:**
- Modify: `src/test/mocks/supabase.ts`
- Create: `src/lib/data/profile-portfolio.ts`
- Create: `src/lib/data/profile-portfolio.test.ts`

- [ ] **Step 1: Extend Supabase test mock**

Modify the storage bucket in `src/test/mocks/supabase.ts`:

```ts
  const storageBucket = {
    upload: vi.fn().mockResolvedValue(storageResult),
    list: vi.fn().mockResolvedValue({
      data: [{ name: "file.jpg", metadata: { size: 123 } }],
      error: null,
    }),
    remove: vi.fn().mockResolvedValue(storageResult),
    createSignedUrls: vi.fn().mockResolvedValue({
      data: [{ path: "profile-1/file.jpg", signedUrl: "http://signed/file.jpg" }],
      error: null,
    }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "http://test/avatar.jpg" } }),
  };
```

- [ ] **Step 2: Write failing fetcher tests**

Create `src/lib/data/profile-portfolio.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

const mockSupabase = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase.client),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockResolvedValue(mockSupabase.client),
}));

const {
  getPortfolioItemsByProfileId,
  getPortfolioItemsByContactProfileId,
} = await import("./profile-portfolio");

const row = {
  id: "item-1",
  profile_id: "profile-1",
  storage_path: "profile-1/file.jpg",
  original_filename: "file.jpg",
  mime_type: "image/jpeg",
  size_bytes: 123,
  title: "Reef",
  caption: "Coral wall",
  sort_order: 0,
  created_at: "2026-05-06T00:00:00.000Z",
  updated_at: "2026-05-06T00:00:00.000Z",
};

beforeEach(() => {
  mockSupabase.mockQueryResult([row], null);
  mockSupabase.storage.createSignedUrls.mockResolvedValue({
    data: [{ path: row.storage_path, signedUrl: "http://signed/file.jpg" }],
    error: null,
  });
});

describe("profile portfolio fetchers", () => {
  it("loads profile portfolio rows with signed URLs", async () => {
    const result = await getPortfolioItemsByProfileId("profile-1");

    expect(mockSupabase.client.from).toHaveBeenCalledWith("profile_portfolio_items");
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("profile_id", "profile-1");
    expect(mockSupabase.storage.createSignedUrls).toHaveBeenCalledWith(
      [row.storage_path],
      60 * 10,
    );
    expect(result).toEqual([
      { ...row, signedUrl: "http://signed/file.jpg", imageError: null },
    ]);
  });

  it("returns empty array without signing when there are no rows", async () => {
    mockSupabase.mockQueryResult([], null);

    await expect(getPortfolioItemsByProfileId("profile-1")).resolves.toEqual([]);
    expect(mockSupabase.storage.createSignedUrls).not.toHaveBeenCalled();
  });

  it("returns per-item degraded state when signed URL generation fails", async () => {
    mockSupabase.storage.createSignedUrls.mockResolvedValue({
      data: null,
      error: { message: "storage unavailable" },
    });

    await expect(getPortfolioItemsByProfileId("profile-1")).resolves.toEqual([
      {
        ...row,
        signedUrl: null,
        imageError: "Failed to sign portfolio images: storage unavailable",
      },
    ]);
  });

  it("loads by contact profile id", async () => {
    await getPortfolioItemsByContactProfileId({ profileId: "profile-1" });

    expect(mockSupabase.query.eq).toHaveBeenCalledWith("profile_id", "profile-1");
  });

  it("returns no admin portfolio rows when contact has no profile", async () => {
    await expect(
      getPortfolioItemsByContactProfileId({ profileId: null }),
    ).resolves.toEqual([]);
  });
});
```

- [ ] **Step 3: Run fetcher tests and verify they fail**

Run:

```bash
npm run test:unit -- src/lib/data/profile-portfolio.test.ts
```

Expected: fail with missing `src/lib/data/profile-portfolio.ts`.

- [ ] **Step 4: Implement fetchers**

Create `src/lib/data/profile-portfolio.ts`:

```ts
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROFILE_PORTFOLIO_BUCKET } from "@/lib/storage/profile-portfolio";
import type {
  ProfilePortfolioItem,
  ProfilePortfolioItemWithUrl,
} from "@/types/database";

const SIGNED_URL_TTL_SECONDS = 60 * 10;

async function attachSignedUrls(
  rows: ProfilePortfolioItem[],
): Promise<ProfilePortfolioItemWithUrl[]> {
  if (rows.length === 0) return [];

  const supabase = await createAdminClient();
  const paths = rows.map((row) => row.storage_path);
  const { data, error } = await supabase.storage
    .from(PROFILE_PORTFOLIO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error) {
    return rows.map((row) => ({
      ...row,
      signedUrl: null,
      imageError: `Failed to sign portfolio images: ${error.message}`,
    }));
  }

  const signedByPath = new Map(
    (data ?? []).map((item) => [item.path, item.signedUrl] as const),
  );

  return rows.map((row) => {
    const signedUrl = signedByPath.get(row.storage_path);
    if (!signedUrl) {
      return {
        ...row,
        signedUrl: null,
        imageError: `Missing signed URL for portfolio item ${row.id}`,
      };
    }
    return { ...row, signedUrl, imageError: null };
  });
}

export const getPortfolioItemsByProfileId = cache(
  async function getPortfolioItemsByProfileId(
    profileId: string,
  ): Promise<ProfilePortfolioItemWithUrl[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profile_portfolio_items")
      .select("*")
      .eq("profile_id", profileId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to load portfolio items: ${error.message}`);
    }

    return attachSignedUrls((data ?? []) as ProfilePortfolioItem[]);
  },
);

export const getPortfolioItemsByContactProfileId = cache(
  async function getPortfolioItemsByContactProfileId(input: {
    profileId: string | null;
  }): Promise<ProfilePortfolioItemWithUrl[]> {
    if (!input.profileId) return [];
    return getPortfolioItemsByProfileId(input.profileId);
  },
);
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm run test:unit -- src/lib/data/profile-portfolio.test.ts
```

Expected: pass.

Commit:

```bash
git add src/test/mocks/supabase.ts src/lib/data/profile-portfolio.ts src/lib/data/profile-portfolio.test.ts
git commit -m "feat: load signed profile portfolio items"
```

---

### Task 4: Add Portfolio Metadata Actions

**Files:**
- Modify: `src/lib/data/contacts.ts`
- Create: `src/app/(dashboard)/profile/portfolio/actions.ts`
- Create: `src/app/(dashboard)/profile/portfolio/actions.test.ts`

- [ ] **Step 1: Add contact ID lookup helper**

Modify `src/lib/data/contacts.ts` after `findOrCreateContact`:

```ts
export async function getContactIdsByProfileId(
  profileId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("contact_ids_for_profile", {
    p_profile_id: profileId,
  });

  if (error) {
    throw new Error(`Failed to load contact ids for profile: ${error.message}`);
  }

  return (data ?? []) as string[];
}
```

- [ ] **Step 2: Write failing action tests**

Create `src/app/(dashboard)/profile/portfolio/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

const mockSupabase = createMockSupabaseClient();
const mockRevalidatePath = vi.fn();
const mockGetContactIdsByProfileId = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase.client),
}));

vi.mock("@/lib/data/contacts", () => ({
  getContactIdsByProfileId: mockGetContactIdsByProfileId,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

const {
  createPortfolioItemAction,
  updatePortfolioItemAction,
  deletePortfolioItemAction,
} = await import("./actions");

const user = { id: "profile-1", email: "member@example.com" };

beforeEach(() => {
  mockRevalidatePath.mockReset();
  mockGetContactIdsByProfileId.mockReset().mockResolvedValue(["contact-1"]);
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user }, error: null });
  mockSupabase.mockQueryResult({ id: "item-1" }, null, 0);
  mockSupabase.storage.list.mockResolvedValue({
    data: [{ name: "file.jpg", metadata: { size: 10 } }],
    error: null,
  });
  mockSupabase.storage.remove.mockResolvedValue({ data: [], error: null });
});

describe("createPortfolioItemAction", () => {
  it("rejects anonymous users", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(
      createPortfolioItemAction({
        storagePath: "profile-1/file.jpg",
        originalFilename: "file.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        title: "",
        caption: "",
      }),
    ).rejects.toThrow("You must be logged in");
  });

  it("rejects paths outside the user's folder", async () => {
    await expect(
      createPortfolioItemAction({
        storagePath: "other/file.jpg",
        originalFilename: "file.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        title: "",
        caption: "",
      }),
    ).rejects.toThrow("Invalid portfolio storage path");
  });

  it("rejects unsupported MIME types", async () => {
    await expect(
      createPortfolioItemAction({
        storagePath: "profile-1/file.heic",
        originalFilename: "file.heic",
        mimeType: "image/heic",
        sizeBytes: 10,
        title: "",
        caption: "",
      }),
    ).rejects.toThrow("Portfolio images must be JPEG, PNG, or WebP");
  });

  it("rejects metadata for objects that are not in storage", async () => {
    mockSupabase.storage.list.mockResolvedValue({ data: [], error: null });

    await expect(
      createPortfolioItemAction({
        storagePath: "profile-1/missing.jpg",
        originalFilename: "missing.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        title: "",
        caption: "",
      }),
    ).rejects.toThrow("Uploaded portfolio image was not found");
  });

  it("rejects profiles that already reached the item limit", async () => {
    mockSupabase.mockQueryResult(null, null, 50);

    await expect(
      createPortfolioItemAction({
        storagePath: "profile-1/file.jpg",
        originalFilename: "file.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        title: "",
        caption: "",
      }),
    ).rejects.toThrow("Portfolio limit reached");
  });

  it("inserts portfolio metadata and revalidates profile surfaces", async () => {
    const result = await createPortfolioItemAction({
      storagePath: "profile-1/file.jpg",
      originalFilename: "file.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      title: " Reef ",
      caption: " Coral wall ",
    });

    expect(result).toEqual({ id: "item-1" });
    expect(mockSupabase.client.from).toHaveBeenCalledWith("profile_portfolio_items");
    expect(mockSupabase.query.insert).toHaveBeenCalledWith({
      profile_id: "profile-1",
      storage_path: "profile-1/file.jpg",
      original_filename: "file.jpg",
      mime_type: "image/jpeg",
      size_bytes: 10,
      title: "Reef",
      caption: "Coral wall",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/profile", "layout");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/community/members/profile-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/contacts/contact-1");
  });
});

describe("updatePortfolioItemAction", () => {
  it("updates only owner metadata", async () => {
    await updatePortfolioItemAction("item-1", {
      title: "New title",
      caption: "",
    });

    expect(mockSupabase.query.update).toHaveBeenCalledWith({
      title: "New title",
      caption: null,
      updated_at: expect.any(String),
    });
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("id", "item-1");
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("profile_id", "profile-1");
  });
});

describe("deletePortfolioItemAction", () => {
  it("loads owner item, removes storage, then deletes metadata", async () => {
    mockSupabase.mockQueryResult({
      id: "item-1",
      profile_id: "profile-1",
      storage_path: "profile-1/file.jpg",
    });

    await deletePortfolioItemAction("item-1");

    expect(mockSupabase.storage.remove).toHaveBeenCalledWith(["profile-1/file.jpg"]);
    expect(mockSupabase.query.delete).toHaveBeenCalled();
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("id", "item-1");
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("profile_id", "profile-1");
  });
});
```

- [ ] **Step 3: Run action tests and verify they fail**

Run:

```bash
npm run test:unit -- src/app/'(dashboard)'/profile/portfolio/actions.test.ts
```

Expected: fail with missing `actions.ts`.

- [ ] **Step 4: Implement actions**

Create `src/app/(dashboard)/profile/portfolio/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { getContactIdsByProfileId } from "@/lib/data/contacts";
import { createClient } from "@/lib/supabase/server";
import {
  isAllowedPortfolioImageType,
  PROFILE_PORTFOLIO_BUCKET,
  storagePathBelongsToProfile,
} from "@/lib/storage/profile-portfolio";

const metadataSchema = z.object({
  storagePath: z.string().min(1),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.string().refine(isAllowedPortfolioImageType, {
    message: "Portfolio images must be JPEG, PNG, or WebP.",
  }),
  sizeBytes: z.number().int().positive(),
  title: z.string().max(120).optional().default(""),
  caption: z.string().max(1000).optional().default(""),
});

const updateSchema = z.object({
  title: z.string().max(120).optional().default(""),
  caption: z.string().max(1000).optional().default(""),
});

const MAX_PORTFOLIO_ITEMS = 50;

async function requireUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("You must be logged in.");
  return { supabase, userId: user.id };
}

function cleanOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function revalidatePortfolioSurfaces(profileId: string) {
  revalidatePath("/profile", "layout");
  revalidatePath(`/community/members/${profileId}`);
  revalidatePath("/admin");
  const contactIds = await getContactIdsByProfileId(profileId);
  for (const contactId of contactIds) {
    revalidatePath(`/admin/contacts/${contactId}`);
  }
}

async function assertPortfolioCapacity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
) {
  const { count, error } = await supabase
    .from("profile_portfolio_items")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);

  if (error) throw new Error(`Failed to count portfolio items: ${error.message}`);
  if ((count ?? 0) >= MAX_PORTFOLIO_ITEMS) {
    throw new Error(`Portfolio limit reached (${MAX_PORTFOLIO_ITEMS} images).`);
  }
}

async function assertUploadedObjectExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storagePath: string,
) {
  const [folder, ...nameParts] = storagePath.split("/");
  const fileName = nameParts.join("/");
  if (!folder || !fileName || fileName.includes("/")) {
    throw new Error("Invalid portfolio storage path.");
  }

  const { data, error } = await supabase.storage
    .from(PROFILE_PORTFOLIO_BUCKET)
    .list(folder, { search: fileName, limit: 10 });

  if (error) {
    throw new Error(`Failed to verify portfolio image: ${error.message}`);
  }

  const exists = (data ?? []).some((item) => item.name === fileName);
  if (!exists) throw new Error("Uploaded portfolio image was not found.");
}

export async function createPortfolioItemAction(input: {
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  title?: string;
  caption?: string;
}) {
  const { supabase, userId } = await requireUserId();
  const parsed = metadataSchema.parse(input);

  if (!storagePathBelongsToProfile(parsed.storagePath, userId)) {
    throw new Error("Invalid portfolio storage path.");
  }

  await assertPortfolioCapacity(supabase, userId);
  await assertUploadedObjectExists(supabase, parsed.storagePath);

  const { data, error } = await supabase
    .from("profile_portfolio_items")
    .insert({
      profile_id: userId,
      storage_path: parsed.storagePath,
      original_filename: parsed.originalFilename,
      mime_type: parsed.mimeType,
      size_bytes: parsed.sizeBytes,
      title: cleanOptionalText(parsed.title),
      caption: cleanOptionalText(parsed.caption),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to save portfolio item: ${error.message}`);
  }

  await revalidatePortfolioSurfaces(userId);
  return data as { id: string };
}

export async function updatePortfolioItemAction(
  id: string,
  input: { title?: string; caption?: string },
) {
  const { supabase, userId } = await requireUserId();
  const parsed = updateSchema.parse(input);

  const { data, error } = await supabase
    .from("profile_portfolio_items")
    .update({
      title: cleanOptionalText(parsed.title),
      caption: cleanOptionalText(parsed.caption),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("profile_id", userId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Failed to update portfolio item: ${error.message}`);
  if (!data) throw new Error("Portfolio item not found.");

  await revalidatePortfolioSurfaces(userId);
  return data as { id: string };
}

export async function deletePortfolioItemAction(id: string) {
  const { supabase, userId } = await requireUserId();
  const { data: item, error: loadError } = await supabase
    .from("profile_portfolio_items")
    .select("id, profile_id, storage_path")
    .eq("id", id)
    .eq("profile_id", userId)
    .maybeSingle();

  if (loadError) throw new Error(`Failed to load portfolio item: ${loadError.message}`);
  if (!item) throw new Error("Portfolio item not found.");

  const storagePath = (item as { storage_path: string }).storage_path;
  const { error: removeError } = await supabase.storage
    .from(PROFILE_PORTFOLIO_BUCKET)
    .remove([storagePath]);

  if (removeError) {
    throw new Error(`Failed to delete portfolio image: ${removeError.message}`);
  }

  const { error: deleteError } = await supabase
    .from("profile_portfolio_items")
    .delete()
    .eq("id", id)
    .eq("profile_id", userId);

  if (deleteError) {
    throw new Error(`Failed to delete portfolio item: ${deleteError.message}`);
  }

  await revalidatePortfolioSurfaces(userId);
}
```

- [ ] **Step 5: Run action tests and commit**

Run:

```bash
npm run test:unit -- src/app/'(dashboard)'/profile/portfolio/actions.test.ts
```

Expected: pass.

Commit:

```bash
git add src/lib/data/contacts.ts src/app/'(dashboard)'/profile/portfolio/actions.ts src/app/'(dashboard)'/profile/portfolio/actions.test.ts
git commit -m "feat: add profile portfolio metadata actions"
```

---

### Task 5: Link Logged-In Applicants to Contacts

**Files:**
- Modify: `src/lib/data/contacts.ts`
- Modify: `src/app/(marketing)/academy/[program]/apply/actions.ts`
- Modify: `src/app/(marketing)/academy/[program]/apply/actions.test.ts`

- [ ] **Step 1: Add data helper test coverage in application action tests**

Modify `src/app/(marketing)/academy/[program]/apply/actions.test.ts` mocks to include `linkContactToProfileIfUnset`:

```ts
vi.mock("@/lib/data/contacts", () => ({
  findOrCreateContact: vi.fn().mockResolvedValue("mock-contact-id"),
  linkContactToProfileIfUnset: vi.fn().mockResolvedValue(true),
}));
```

Add this test in the submit suite:

```ts
it("links the contact to the logged-in applicant profile", async () => {
  const { linkContactToProfileIfUnset } = await import("@/lib/data/contacts");
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-123" } },
    error: null,
  });
  mockBuildFullSchema.mockReturnValueOnce(z.object({}).passthrough());

  const formData = new FormData();
  formData.set("email", "alice@example.com");
  formData.set("first_name", "Alice");
  formData.set("last_name", "Smith");

  await expect(
    submitAcademyApplication("photography", prevState, formData),
  ).rejects.toThrow(RedirectError);

  expect(linkContactToProfileIfUnset).toHaveBeenCalledWith(
    "mock-contact-id",
    "user-123",
  );
});
```

- [ ] **Step 2: Run the application test and verify it fails**

Run:

```bash
npm run test:unit -- src/app/'(marketing)'/academy/'[program]'/apply/actions.test.ts
```

Expected: fail because `linkContactToProfileIfUnset` is not exported or not called.

- [ ] **Step 3: Implement contact link helper**

Modify `src/lib/data/contacts.ts` after `findOrCreateContact`:

```ts
export async function linkContactToProfileIfUnset(
  contactId: string,
  profileId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "link_contact_to_profile_if_unset",
    {
      p_contact_id: contactId,
      p_profile_id: profileId,
    },
  );

  if (error) {
    throw new Error(`Failed to link contact to profile: ${error.message}`);
  }

  return Boolean(data);
}
```

- [ ] **Step 4: Call helper during logged-in application submission**

Modify imports in `src/app/(marketing)/academy/[program]/apply/actions.ts`:

```ts
import {
  findOrCreateContact,
  linkContactToProfileIfUnset,
} from "@/lib/data/contacts";
```

After `supabase.auth.getUser()` and before `submitApplication(...)`, add:

```ts
  if (user) {
    await linkContactToProfileIfUnset(contactId, user.id);
  }
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm run test:unit -- src/app/'(marketing)'/academy/'[program]'/apply/actions.test.ts
```

Expected: pass.

Commit:

```bash
git add src/lib/data/contacts.ts src/app/'(marketing)'/academy/'[program]'/apply/actions.ts src/app/'(marketing)'/academy/'[program]'/apply/actions.test.ts
git commit -m "feat: link applicant contacts to profiles"
```

---

### Task 6: Build Owner Portfolio Management UI

**Files:**
- Create: `src/app/(dashboard)/profile/portfolio/portfolio-uploader.tsx`
- Create: `src/app/(dashboard)/profile/portfolio/page.tsx`
- Modify: `src/app/(dashboard)/profile/profile-sidebar.tsx`

- [ ] **Step 1: Add Portfolio nav item**

Modify `src/app/(dashboard)/profile/profile-sidebar.tsx`:

```ts
interface SidebarLink {
  href: string;
  label: string;
  icon: "user" | "file" | "image";
}

const ICON_PATHS: Record<string, string> = {
  user: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.5-1.632Z",
  file: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  image: "m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z",
};
```

Add the link:

```ts
    { href: "/profile/portfolio", label: "Portfolio", icon: "image" },
```

- [ ] **Step 2: Create management page**

Create `src/app/(dashboard)/profile/portfolio/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/data/profiles";
import { getPortfolioItemsByProfileId } from "@/lib/data/profile-portfolio";
import { PortfolioUploader } from "./portfolio-uploader";

export default async function ProfilePortfolioPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const items = await getPortfolioItemsByProfileId(profile.id);

  return (
    <>
      <h1 className="mb-8 text-[length:var(--font-size-h1)] font-medium text-foreground">
        Portfolio
      </h1>
      <PortfolioUploader profileId={profile.id} initialItems={items} />
    </>
  );
}
```

- [ ] **Step 3: Create upload management component**

Create `src/app/(dashboard)/profile/portfolio/portfolio-uploader.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Upload, Trash2, Save, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import * as tus from "tus-js-client";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getProfilePortfolioUploadEndpoint,
  isAllowedPortfolioImageType,
  portfolioStoragePath,
  PROFILE_PORTFOLIO_BUCKET,
} from "@/lib/storage/profile-portfolio";
import type { ProfilePortfolioItemWithUrl } from "@/types/database";
import {
  createPortfolioItemAction,
  deletePortfolioItemAction,
  updatePortfolioItemAction,
} from "./actions";

type UploadState = {
  id: string;
  fileName: string;
  progress: number;
  error: string | null;
};

export function PortfolioUploader({
  profileId,
  initialItems,
}: {
  profileId: string;
  initialItems: ProfilePortfolioItemWithUrl[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [editing, setEditing] = useState<Record<string, { title: string; caption: string }>>(
    () =>
      Object.fromEntries(
        initialItems.map((item) => [
          item.id,
          { title: item.title ?? "", caption: item.caption ?? "" },
        ]),
      ),
  );
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setItems(initialItems);
    setEditing(
      Object.fromEntries(
        initialItems.map((item) => [
          item.id,
          { title: item.title ?? "", caption: item.caption ?? "" },
        ]),
      ),
    );
  }, [initialItems]);

  async function uploadFile(file: File) {
    if (!isAllowedPortfolioImageType(file.type)) {
      toast.error(`${file.name} must be JPEG, PNG, or WebP.`);
      return;
    }

    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      toast.error("You must be logged in to upload portfolio images.");
      return;
    }

    const storagePath = portfolioStoragePath(profileId, file.type);
    const uploadId = `${file.name}-${crypto.randomUUID()}`;
    const endpoint = getProfilePortfolioUploadEndpoint(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
    );

    setUploads((current) => [
      ...current,
      { id: uploadId, fileName: file.name, progress: 0, error: null },
    ]);

    try {
      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            authorization: `Bearer ${token}`,
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          fingerprint() {
            return Promise.resolve(storagePath);
          },
          chunkSize: 6 * 1024 * 1024,
          metadata: {
            bucketName: PROFILE_PORTFOLIO_BUCKET,
            objectName: storagePath,
            contentType: file.type,
            cacheControl: "3600",
          },
          onError(error) {
            reject(error);
          },
          onProgress(bytesUploaded, bytesTotal) {
            const progress =
              bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
            setUploads((current) =>
              current.map((item) =>
                item.id === uploadId ? { ...item, progress } : item,
              ),
            );
          },
          onSuccess() {
            resolve();
          },
        });

        // V1 intentionally does not resume persisted previous uploads because
        // object paths are generated per attempt. In-flight retries still use TUS.
        Promise.resolve().then(() => {
          upload.start();
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setUploads((current) =>
        current.map((item) =>
          item.id === uploadId ? { ...item, error: message } : item,
        ),
      );
      throw error;
    }

    await createPortfolioItemAction({
      storagePath,
      originalFilename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      title: "",
      caption: "",
    });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        await uploadFile(file);
        toast.success(`${file.name} uploaded.`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Upload failed.";
        toast.error(message);
      }
    }
    router.refresh();
  }

  function saveItem(itemId: string) {
    const next = editing[itemId];
    startTransition(async () => {
      try {
        await updatePortfolioItemAction(itemId, next);
        setItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? { ...item, title: next.title || null, caption: next.caption || null }
              : item,
          ),
        );
        toast.success("Portfolio item updated.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Update failed.");
      }
    });
  }

  function deleteItem(itemId: string) {
    startTransition(async () => {
      try {
        await deletePortfolioItemAction(itemId);
        setItems((current) => current.filter((item) => item.id !== itemId));
        toast.success("Portfolio item deleted.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Delete failed.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio images</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <Button type="button" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Upload images
          </Button>
        </div>

        {uploads.length > 0 && (
          <div className="flex flex-col gap-2">
            {uploads.map((upload) => (
              <div key={upload.id} className="text-sm text-muted-foreground">
                {upload.fileName}: {upload.error ?? `${upload.progress}%`}
              </div>
            ))}
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Upload JPEG, PNG, or WebP images to build your portfolio.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                  {item.signedUrl ? (
                    <img
                      src={item.signedUrl}
                      alt={item.title || item.original_filename}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-destructive">
                      {item.imageError ?? "Image unavailable."}
                    </div>
                  )}
                </div>
                <label className="mt-3 flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Title</span>
                  <input
                    value={editing[item.id]?.title ?? ""}
                    onChange={(event) =>
                      setEditing((current) => ({
                        ...current,
                        [item.id]: {
                          title: event.target.value,
                          caption: current[item.id]?.caption ?? "",
                        },
                      }))
                    }
                    className="rounded-md border border-border bg-background px-3 py-2"
                  />
                </label>
                <label className="mt-3 flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Caption</span>
                  <textarea
                    value={editing[item.id]?.caption ?? ""}
                    onChange={(event) =>
                      setEditing((current) => ({
                        ...current,
                        [item.id]: {
                          title: current[item.id]?.title ?? "",
                          caption: event.target.value,
                        },
                      }))
                    }
                    className="min-h-20 rounded-md border border-border bg-background px-3 py-2"
                  />
                </label>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => saveItem(item.id)}
                    disabled={isPending}
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteItem(item.id)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run focused checks and commit**

Run:

```bash
npm run lint
npm run build
```

Expected: both pass.

Commit:

```bash
git add src/app/'(dashboard)'/profile/profile-sidebar.tsx src/app/'(dashboard)'/profile/portfolio/page.tsx src/app/'(dashboard)'/profile/portfolio/portfolio-uploader.tsx
git commit -m "feat: add profile portfolio management"
```

---

### Task 7: Add Shared Gallery and Member Profile Display

**Files:**
- Create: `src/components/profile/portfolio-gallery.tsx`
- Modify: `src/app/(marketing)/community/members/[id]/page.tsx`

- [ ] **Step 1: Create shared gallery component**

Create `src/components/profile/portfolio-gallery.tsx`:

```tsx
import type { ProfilePortfolioItemWithUrl } from "@/types/database";

function formatUploadDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function PortfolioGallery({
  items,
  compact = false,
}: {
  items: ProfilePortfolioItemWithUrl[];
  compact?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section className="w-full">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Portfolio
      </h2>
      <div
        className={
          compact
            ? "grid grid-cols-2 gap-3"
            : "grid grid-cols-2 gap-3 sm:grid-cols-3"
        }
      >
        {items.map((item) => (
          <figure key={item.id} className="min-w-0">
            <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
              {item.signedUrl ? (
                <img
                  src={item.signedUrl}
                  alt={item.title || item.original_filename}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-3 text-center text-xs text-destructive">
                  {item.imageError ?? "Image unavailable."}
                </div>
              )}
            </div>
            <figcaption className="mt-2 text-left">
              {item.title && (
                <p className="text-sm font-medium text-foreground">
                  {item.title}
                </p>
              )}
              {item.caption && (
                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                  {item.caption}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Uploaded {formatUploadDate(item.created_at)}
              </p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Render gallery on community member profile**

Modify imports in `src/app/(marketing)/community/members/[id]/page.tsx`:

```ts
import { getPortfolioItemsByProfileId } from "@/lib/data/profile-portfolio";
import { PortfolioGallery } from "@/components/profile/portfolio-gallery";
```

Change data loading:

```ts
  const [user, profile] = await Promise.all([
    getAuthUser(),
    getProfileById(id),
  ]);

  if (!profile) notFound();

  const portfolioItems = await getPortfolioItemsByProfileId(profile.id);
```

Render below the bio/actions inside `CardContent`:

```tsx
          {portfolioItems.length > 0 && (
            <div className="mt-4 w-full">
              <PortfolioGallery items={portfolioItems} />
            </div>
          )}
```

- [ ] **Step 3: Run unit/build checks and commit**

Run:

```bash
npm run build
```

Expected: build passes.

Commit:

```bash
git add src/components/profile/portfolio-gallery.tsx src/app/'(marketing)'/community/members/'[id]'/page.tsx
git commit -m "feat: show portfolio on member profiles"
```

---

### Task 8: Add Admin Contact Portfolio Panel

**Files:**
- Modify: `src/app/(dashboard)/admin/contacts/[id]/page.tsx`

- [ ] **Step 1: Fetch portfolio in contact detail**

Modify imports:

```ts
import { getPortfolioItemsByContactProfileId } from "@/lib/data/profile-portfolio";
import { PortfolioGallery } from "@/components/profile/portfolio-gallery";
```

Change the fetch shape so the contact is loaded first, then the profile-scoped portfolio joins the remaining page data:

```ts
  const contact = await getContactById(id);
  if (!contact) return notFound();

  const [
    applications,
    contactTagRows,
    events,
    categories,
    allTags,
    portfolioItems,
  ] = await Promise.all([
    getApplicationsByContactId(id),
    getContactTags(id),
    getContactEvents(id),
    getTagCategories(),
    getTags(),
    getPortfolioItemsByContactProfileId({
      profileId: contact.profile_id,
    }),
  ]);
```

- [ ] **Step 2: Render admin side panel**

In the right-rail `<div className="flex flex-col gap-6">`, after the Tags card, add:

```tsx
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                Portfolio
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contact.profile_id && portfolioItems.length > 0 ? (
                <PortfolioGallery items={portfolioItems} compact />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No portfolio images linked to this contact.
                </p>
              )}
            </CardContent>
          </Card>
```

- [ ] **Step 3: Update contact detail unit test**

Modify `src/app/(dashboard)/admin/contacts/[id]/page.test.ts` to mock `@/lib/data/profile-portfolio`:

```ts
const mockGetPortfolioItemsByContactProfileId = vi.fn();

vi.mock("@/lib/data/profile-portfolio", () => ({
  getPortfolioItemsByContactProfileId: mockGetPortfolioItemsByContactProfileId,
}));
```

In the happy-path test setup:

```ts
    mockGetContactById.mockResolvedValue({
      id: CONTACT_ID,
      name: "Jane Contact",
      email: "jane@example.com",
      phone: null,
      profile_id: "profile-1",
    });
    mockGetPortfolioItemsByContactProfileId.mockResolvedValue([]);
```

Assert:

```ts
    expect(mockGetPortfolioItemsByContactProfileId).toHaveBeenCalledWith({
      profileId: "profile-1",
    });
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npm run test:unit -- src/app/'(dashboard)'/admin/contacts/'[id]'/page.test.ts
npm run build
```

Expected: both pass.

Commit:

```bash
git add src/app/'(dashboard)'/admin/contacts/'[id]'/page.tsx src/app/'(dashboard)'/admin/contacts/'[id]'/page.test.ts
git commit -m "feat: show contact portfolio in admin"
```

---

### Task 9: Add E2E Coverage

**Files:**
- Create: `e2e/profile-portfolio.spec.ts`

- [ ] **Step 1: Create E2E spec**

Create `e2e/profile-portfolio.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

const TEST_USER = { email: "test@btmhub.com", password: "TestPass123" };
const ADMIN_USER = { email: "admin@btmhub.com", password: "AdminPass123" };

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}

test.describe("Profile portfolio", () => {
  test("anonymous users cannot view member profiles", async ({ page }) => {
    await page.goto("/community/members/11111111-1111-1111-1111-111111111111");
    await expect(page).toHaveURL(/\/login/);
  });

  test("member can open portfolio management", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/profile/portfolio");

    await expect(
      page.getByRole("heading", { name: "Portfolio" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /upload images/i }),
    ).toBeVisible();
  });

  test("member can upload a tiny PNG portfolio image", async ({ page }) => {
    await login(page, TEST_USER);
    await page.goto("/profile/portfolio");

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64",
    );

    await page.setInputFiles("input[type='file']", {
      name: "portfolio-e2e.png",
      mimeType: "image/png",
      buffer: png,
    });

    await expect(page.getByText(/portfolio-e2e\\.png/)).toBeVisible();
    await expect(
      page.getByRole("img", { name: "portfolio-e2e.png" }),
    ).toBeVisible({ timeout: 30_000 });

    const uploadedCard = page.locator("div.rounded-lg", {
      has: page.getByRole("img", { name: "portfolio-e2e.png" }),
    });
    await uploadedCard.getByRole("button", { name: /delete/i }).click();
    await expect(
      page.getByRole("img", { name: "portfolio-e2e.png" }),
    ).toHaveCount(0);
  });

  test("admin contact detail shows portfolio panel", async ({ page }) => {
    await login(page, ADMIN_USER);
    await page.goto("/admin");

    const firstContact = page.locator("a[href^='/admin/contacts/']").first();
    await expect(firstContact).toBeVisible();
    await firstContact.click();
    await page.waitForURL(/\/admin\/contacts\//);

    await expect(page.getByText("Portfolio")).toBeVisible();
  });
});
```

The upload E2E uses a 1x1 PNG so it validates the real route without making the suite binary-heavy.

- [ ] **Step 2: Run E2E**

Run with Supabase and the app dependencies available:

```bash
npm run test:e2e -- e2e/profile-portfolio.spec.ts
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/profile-portfolio.spec.ts
git commit -m "test: cover profile portfolio routes"
```

---

### Task 10: Final Verification

**Files:**
- All files changed by prior tasks.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
npm run test:unit -- src/lib/storage/profile-portfolio.test.ts src/lib/data/profile-portfolio.test.ts src/app/'(dashboard)'/profile/portfolio/actions.test.ts src/app/'(marketing)'/academy/'[program]'/apply/actions.test.ts src/app/'(dashboard)'/admin/contacts/'[id]'/page.test.ts
```

Expected: all listed test files pass.

- [ ] **Step 2: Run full unit suite**

Run:

```bash
npm run test:unit
```

Expected: all Vitest files pass.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: no ESLint errors.

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: production build succeeds.

- [ ] **Step 5: Run targeted E2E**

Run:

```bash
npm run test:e2e -- e2e/profile-portfolio.spec.ts e2e/admin.spec.ts e2e/auth.spec.ts
```

Expected: all selected Playwright tests pass.

- [ ] **Step 6: Manual browser check**

Start dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/profile/portfolio
```

Verify:

- Portfolio nav item is visible in the profile sidebar.
- JPEG/PNG/WebP selection starts upload progress.
- HEIC/GIF selection shows a visible error before upload.
- Uploaded image appears after completion.
- Title/caption save updates the card.
- Delete removes the image card.
- A member profile opened from the Community UI shows the portfolio for an authenticated user.
- A linked contact opened from the Admin contacts table shows the Portfolio card.

- [ ] **Step 7: Final commit if verification changes were needed**

If verification required fixes:

```bash
git add -A
git commit -m "fix: stabilize profile portfolio"
```

If no fixes were needed, do not create an empty commit.
