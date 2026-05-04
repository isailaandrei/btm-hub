# Films Browsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Sanity-backed Netflix-style films browser described in `docs/superpowers/specs/2026-05-04-films-browsing-design.md`.

**Architecture:** Sanity remains the source of truth for public film metadata, curated rows, images, and YouTube/Vimeo embed URLs. `/films` fetches the published catalog and curated collections in a server component, then passes serializable data to a focused client browser that owns search, filter drawer, row navigation, hover expansion, and modal state.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Sanity 5, next-sanity 12, Tailwind CSS 4, shadcn/radix-maia primitives, Radix primitives through `radix-ui`, Vitest, Playwright.

---

## Implementation Decisions

- Public film cards require `slug.current`. This preserves the current `/films` behavior and keeps every playable card eligible for a detail page link.
- `filmCollection.films` rejects duplicate film references in Sanity. Repeating the same film in one row is editorial noise, not a required feature.
- Metadata arrays remain editor-managed Sanity tag arrays, but the schema rejects duplicate values and the UI helper trims/case-normalizes values to prevent public filter fragmentation.
- When search or filters are active, the browser collapses results into one `Matching Films` row. This avoids repeating the same filtered result set under Featured, Latest, and All Films.

---

## File Structure

### Sanity Schema and Queries

- Modify `src/lib/sanity/schemas/documents/film.ts`: add field groups, card thumbnail, categorized metadata arrays, and display tags.
- Create `src/lib/sanity/schemas/documents/filmCollection.ts`: curated row document with ordered film references.
- Modify `src/lib/sanity/schemas/index.ts`: register `filmCollection`.
- Modify `src/lib/sanity/schemas/schemas.test.ts`: assert new schema registration and key fields.
- Modify `src/lib/sanity/queries.ts`: include new film fields and add `FILM_COLLECTIONS_QUERY`.
- Modify `src/lib/data/sanity.ts`: export `FilmCollection` type and `getFilmCollections()`.
- Modify `src/lib/data/sanity.test.ts`: cover `getFilmCollections()`.
- Regenerate `sanity.types.ts` with `npm run typegen`.

### Films Domain Helpers

- Create `src/lib/films/types.ts`: UI-facing serializable film and collection contracts.
- Create `src/lib/films/embed.ts`: YouTube/Vimeo URL normalization and iframe allowlist.
- Create `src/lib/films/embed.test.ts`: valid and invalid embed URL tests.
- Create `src/lib/films/filtering.ts`: search/filter option derivation and filtering.
- Create `src/lib/films/filtering.test.ts`: metadata, search, filter, and empty-result tests.
- Create `src/lib/films/rows.ts`: curated and fallback row builder.
- Create `src/lib/films/rows.test.ts`: row ordering, empty curated row removal, and fallback tests.

### UI Primitives

- Create `src/components/ui/dialog.tsx`: minimal Radix Dialog primitive for the playback modal.
- Create `src/components/ui/sheet.tsx`: minimal Radix Dialog-based Sheet primitive for filters.

### Films UI

- Create `src/components/films/FilmsBrowser.tsx`: client entry point for search, filters, rows, and modal.
- Create `src/components/films/FilmCard.tsx`: responsive film card with desktop hover/focus expansion.
- Create `src/components/films/FilmRow.tsx`: horizontal row with scroll buttons.
- Create `src/components/films/FilmFilterSheet.tsx`: search filter drawer grouped by category.
- Create `src/components/films/FilmPlaybackModal.tsx`: iframe modal with invalid-video state and details link.
- Create `src/components/films/FilmPoster.tsx`: Sanity image poster with visible title fallback.
- Modify `src/app/(marketing)/films/page.tsx`: fetch films plus collections and render `FilmsBrowser`.
- Modify `src/app/(marketing)/films/[slug]/page.tsx`: reuse safe embed normalization.

### E2E

- Modify `e2e/sanity-pages.spec.ts`: extend films smoke coverage for browser controls that do not depend on live CMS content volume.

---

## Task 0: Pre-Flight Baseline

**Files:** none.

- [ ] **Step 0.1: Confirm branch and worktree state**

Run:

```bash
git status --short --branch
```

Expected:

```text
## feature/films-video-library
M  .gitignore
M  docs/debugging/admin-ai-memory-runtime-notes.md
```

If additional files are present, inspect them before editing. Do not stage or revert unrelated files.

- [ ] **Step 0.2: Run current focused tests**

Run:

```bash
npm run test:unit -- src/lib/sanity/schemas/schemas.test.ts src/lib/data/sanity.test.ts
```

Expected: both test files pass before films work starts.

- [ ] **Step 0.3: Run current films smoke test**

Run:

```bash
npm run test:e2e -- e2e/sanity-pages.spec.ts -g "films page loads"
```

Expected: the existing `/films` smoke test passes. If it fails because the app cannot reach required local env services, record the exact error and continue with unit-first implementation.

- [ ] **Step 0.4: Commit checkpoint**

Do not commit. This is a baseline-only task.

---

## Task 1: Sanity Film Metadata Schema

**Files:**
- Modify `src/lib/sanity/schemas/documents/film.ts`
- Create `src/lib/sanity/schemas/documents/filmCollection.ts`
- Modify `src/lib/sanity/schemas/index.ts`
- Modify `src/lib/sanity/schemas/schemas.test.ts`

- [ ] **Step 1.1: Write failing schema tests**

Modify `src/lib/sanity/schemas/schemas.test.ts` so the schema list expects the new document and verifies key fields:

```ts
import { describe, it, expect } from "vitest";
import { schemaTypes } from "./index";

function fieldsFor(name: string) {
  const schema = schemaTypes.find((s) => s.name === name) as
    | { fields?: { name: string; type: string; validation?: unknown; of?: { type: string; to?: { type: string }[] }[] }[] }
    | undefined;
  return schema?.fields ?? [];
}

describe("sanity schemas", () => {
  it("exports all expected schema types", () => {
    const names = schemaTypes.map((s) => s.name);
    expect(names).toContain("portableText");
    expect(names).toContain("gallery");
    expect(names).toContain("socialLink");
    expect(names).toContain("faq");
    expect(names).toContain("testimonial");
    expect(names).toContain("film");
    expect(names).toContain("filmCollection");
    expect(names).toContain("program");
    expect(names).toContain("teamMember");
    expect(names).toContain("partner");
  });

  it("has 10 total schema types (5 objects + 5 documents)", () => {
    expect(schemaTypes).toHaveLength(10);
  });

  it("film schema exposes browsing metadata fields", () => {
    const film = schemaTypes.find((s) => s.name === "film");
    expect(film?.type).toBe("document");
    const fieldNames = fieldsFor("film").map((f) => f.name);

    expect(fieldNames).toEqual(
      expect.arrayContaining([
        "thumbnailImage",
        "locations",
        "subjects",
        "formats",
        "skills",
        "displayTags",
      ]),
    );
    for (const metadataField of ["locations", "subjects", "formats", "skills", "displayTags"]) {
      expect(fieldsFor("film").find((field) => field.name === metadataField)?.validation).toBeTypeOf("function");
    }
  });

  it("filmCollection schema references ordered films", () => {
    const collection = schemaTypes.find((s) => s.name === "filmCollection");
    expect(collection?.type).toBe("document");
    const fields = fieldsFor("filmCollection");
    const filmsField = fields.find((f) => f.name === "films");

    expect(fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(["title", "slug", "description", "films", "sortOrder", "enabled"]),
    );
    expect(filmsField?.type).toBe("array");
    expect(filmsField?.of?.[0]?.type).toBe("reference");
    expect(filmsField?.of?.[0]?.to?.[0]?.type).toBe("film");
    expect(filmsField?.validation).toBeTypeOf("function");
  });

  it("portableText schema is an array type", () => {
    const pt = schemaTypes.find((s) => s.name === "portableText");
    expect(pt?.type).toBe("array");
  });

  it("program schema uses string enum for slug (not slug type)", () => {
    const program = schemaTypes.find((s) => s.name === "program");
    expect(program?.type).toBe("document");
    const fields = fieldsFor("program");
    const slugField = fields.find((f) => f.name === "slug");
    expect(slugField?.type).toBe("string");
  });
});
```

- [ ] **Step 1.2: Run schema tests to verify they fail**

Run:

```bash
npm run test:unit -- src/lib/sanity/schemas/schemas.test.ts
```

Expected: FAIL because `filmCollection`, `thumbnailImage`, `locations`, `subjects`, `formats`, `skills`, and `displayTags` are not defined yet.

- [ ] **Step 1.3: Extend the film schema**

Modify `src/lib/sanity/schemas/documents/film.ts`. Keep the existing fields and add `groups` plus the new fields below. The existing field definitions can stay in place with group names added as shown.

```ts
import { defineType, defineField } from "sanity";

const metadataField = (name: string, title: string, description: string) =>
  defineField({
    name,
    title,
    type: "array",
    group: "metadata",
    description,
    of: [{ type: "string" }],
    options: { layout: "tags" },
    validation: (rule) =>
      rule.unique().custom((values) => {
        if (!Array.isArray(values)) return true;
        const normalized = values
          .map((value) => String(value).trim().toLowerCase())
          .filter(Boolean);
        return new Set(normalized).size === normalized.length
          ? true
          : "Values must be unique after trimming and case normalization.";
      }),
  });

export const film = defineType({
  name: "film",
  title: "Film",
  type: "document",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "media", title: "Media" },
    { name: "playback", title: "Playback" },
    { name: "metadata", title: "Metadata" },
  ],
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      group: "content",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      group: "content",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "tagline",
      title: "Tagline",
      type: "string",
      group: "content",
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "portableText",
      group: "content",
    }),
    defineField({
      name: "heroImage",
      title: "Hero Image",
      type: "image",
      group: "media",
      options: { hotspot: true },
      validation: (rule) => rule.required(),
      fields: [
        {
          name: "alt",
          type: "string",
          title: "Alt Text",
          validation: (rule) => rule.required(),
        },
      ],
    }),
    defineField({
      name: "thumbnailImage",
      title: "Card Thumbnail",
      type: "image",
      group: "media",
      description: "Optional 16:9 poster for film cards. Falls back to Hero Image.",
      options: { hotspot: true },
      fields: [
        {
          name: "alt",
          type: "string",
          title: "Alt Text",
        },
      ],
    }),
    defineField({
      name: "videoEmbed",
      title: "Video Embed URL",
      type: "url",
      group: "playback",
      description: "YouTube or Vimeo URL. The app normalizes watch URLs to safe player embed URLs.",
    }),
    defineField({
      name: "gallery",
      title: "Gallery",
      type: "gallery",
      group: "media",
    }),
    defineField({
      name: "credits",
      title: "Credits",
      type: "array",
      group: "content",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "role", type: "string", title: "Role", validation: (rule) => rule.required() }),
            defineField({ name: "name", type: "string", title: "Name", validation: (rule) => rule.required() }),
          ],
          preview: {
            select: { title: "name", subtitle: "role" },
          },
        },
      ],
    }),
    defineField({
      name: "releaseYear",
      title: "Release Year",
      type: "number",
      group: "metadata",
    }),
    defineField({
      name: "duration",
      title: "Duration",
      type: "string",
      group: "metadata",
      description: "e.g. 12:34",
    }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      group: "metadata",
      options: {
        list: [
          { title: "Published", value: "published" },
          { title: "In Production", value: "in-production" },
          { title: "Coming Soon", value: "coming-soon" },
        ],
      },
      initialValue: "published",
    }),
    metadataField("locations", "Locations", "Places featured in the film."),
    metadataField("subjects", "Subjects", "People, species, themes, or story subjects."),
    metadataField("formats", "Formats", "Editorial format such as documentary, tutorial, short film, or behind the scenes."),
    metadataField("skills", "Skills", "Production or underwater skills shown in the film."),
    defineField({
      name: "displayTags",
      title: "Display Tags",
      type: "array",
      group: "metadata",
      description: "Short editorial chips shown on cards and in the player modal.",
      of: [{ type: "string", validation: (rule) => rule.max(32) }],
      options: { layout: "tags" },
      validation: (rule) =>
        rule
          .unique()
          .max(6)
          .custom((values) => {
            if (!Array.isArray(values)) return true;
            const normalized = values
              .map((value) => String(value).trim().toLowerCase())
              .filter(Boolean);
            return new Set(normalized).size === normalized.length
              ? true
              : "Display tags must be unique after trimming and case normalization.";
          }),
    }),
    defineField({
      name: "featured",
      title: "Featured",
      type: "boolean",
      group: "metadata",
      initialValue: false,
    }),
    defineField({
      name: "sortOrder",
      title: "Sort Order",
      type: "number",
      group: "metadata",
      initialValue: 0,
    }),
  ],
  orderings: [
    {
      title: "Sort Order",
      name: "sortOrder",
      by: [{ field: "sortOrder", direction: "asc" }],
    },
  ],
  preview: {
    select: { title: "title", subtitle: "tagline", media: "heroImage" },
  },
});
```

- [ ] **Step 1.4: Create the film collection schema**

Create `src/lib/sanity/schemas/documents/filmCollection.ts`:

```ts
import { defineField, defineType } from "sanity";

export const filmCollection = defineType({
  name: "filmCollection",
  title: "Film Collection",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "films",
      title: "Films",
      type: "array",
      of: [{ type: "reference", to: [{ type: "film" }] }],
      validation: (rule) =>
        rule
          .required()
          .min(1)
          .unique()
          .custom((values) => {
            if (!Array.isArray(values)) return true;
            const refs = values
              .map((value) => (typeof value === "object" && value && "_ref" in value ? String(value._ref) : ""))
              .filter(Boolean);
            return new Set(refs).size === refs.length
              ? true
              : "A film can only appear once in a collection.";
          }),
    }),
    defineField({
      name: "sortOrder",
      title: "Sort Order",
      type: "number",
      initialValue: 0,
    }),
    defineField({
      name: "enabled",
      title: "Enabled",
      type: "boolean",
      initialValue: true,
    }),
  ],
  orderings: [
    {
      title: "Sort Order",
      name: "sortOrder",
      by: [{ field: "sortOrder", direction: "asc" }],
    },
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "description",
    },
  },
});
```

- [ ] **Step 1.5: Register the new schema**

Modify `src/lib/sanity/schemas/index.ts`:

```ts
import type { SchemaTypeDefinition } from "sanity";

// Objects
import { portableText } from "./objects/portableText";
import { gallery } from "./objects/gallery";
import { socialLink } from "./objects/socialLink";
import { faq } from "./objects/faq";
import { testimonial } from "./objects/testimonial";

// Documents
import { film } from "./documents/film";
import { filmCollection } from "./documents/filmCollection";
import { program } from "./documents/program";
import { teamMember } from "./documents/teamMember";
import { partner } from "./documents/partner";

export const schemaTypes: SchemaTypeDefinition[] = [
  // Objects
  portableText,
  gallery,
  socialLink,
  faq,
  testimonial,
  // Documents
  film,
  filmCollection,
  program,
  teamMember,
  partner,
];
```

- [ ] **Step 1.6: Run schema tests**

Run:

```bash
npm run test:unit -- src/lib/sanity/schemas/schemas.test.ts
```

Expected: PASS.

- [ ] **Step 1.7: Commit schema changes**

Run:

```bash
git add src/lib/sanity/schemas/documents/film.ts src/lib/sanity/schemas/documents/filmCollection.ts src/lib/sanity/schemas/index.ts src/lib/sanity/schemas/schemas.test.ts
git commit -m "feat: add film browsing metadata schema"
```

Expected: commit succeeds with only the schema files and schema test staged.

---

## Task 2: Sanity Queries and Data Fetchers

**Files:**
- Modify `src/lib/sanity/queries.ts`
- Modify `src/lib/data/sanity.ts`
- Modify `src/lib/data/sanity.test.ts`
- Modify `sanity.types.ts` by running `npm run typegen`

- [ ] **Step 2.1: Write failing data fetcher test**

Modify the import list and tests in `src/lib/data/sanity.test.ts`:

```ts
import {
  getFilms,
  getFilmBySlug,
  getFilmCollections,
  getAllFilmSlugs,
  getTeamMembers,
  getPartners,
  getFeaturedPartners,
  getProgramContent,
} from "./sanity";
```

Add this test inside `describe("sanity data fetchers", () => { ... })`:

```ts
it("getFilmCollections returns enabled curated rows", async () => {
  const collections = [
    {
      _id: "collection-1",
      title: "Featured Stories",
      slug: { current: "featured-stories" },
      description: "Selected films",
      films: [{ _id: "film-1", title: "Deep Blue" }],
    },
  ];
  mockSanityFetch.mockResolvedValueOnce({ data: collections });

  const result = await getFilmCollections();

  expect(result).toEqual(collections);
  expect(mockSanityFetch).toHaveBeenCalledTimes(1);
  expect(mockSanityFetch.mock.calls[0][0]).toHaveProperty("query");
});
```

- [ ] **Step 2.2: Run data tests to verify failure**

Run:

```bash
npm run test:unit -- src/lib/data/sanity.test.ts
```

Expected: FAIL because `getFilmCollections` is not exported.

- [ ] **Step 2.3: Extend Sanity queries**

Modify the films section in `src/lib/sanity/queries.ts`:

```ts
const FILM_CARD_FIELDS = `
  _id,
  title,
  slug,
  tagline,
  heroImage,
  thumbnailImage,
  videoEmbed,
  duration,
  releaseYear,
  status,
  featured,
  sortOrder,
  locations,
  subjects,
  formats,
  skills,
  displayTags
`;

export const FILMS_QUERY = defineQuery(`
  *[_type == "film" && defined(slug.current)] | order(sortOrder asc, releaseYear desc) {
    ${FILM_CARD_FIELDS}
  }
`);

export const FILM_BY_SLUG_QUERY = defineQuery(`
  *[_type == "film" && slug.current == $slug][0] {
    _id, title, slug, tagline, description, heroImage, thumbnailImage, videoEmbed,
    gallery, credits, releaseYear, duration, status, featured, sortOrder,
    locations, subjects, formats, skills, displayTags
  }
`);

export const FEATURED_FILMS_QUERY = defineQuery(`
  *[_type == "film" && featured == true && defined(slug.current)] | order(sortOrder asc) {
    ${FILM_CARD_FIELDS}
  }
`);

export const FILM_COLLECTIONS_QUERY = defineQuery(`
  *[_type == "filmCollection" && enabled == true] | order(sortOrder asc) {
    _id,
    title,
    slug,
    description,
    sortOrder,
    films[]->{
      ${FILM_CARD_FIELDS}
    }
  }
`);
```

Keep `ALL_FILM_SLUGS_QUERY` unchanged.

- [ ] **Step 2.4: Add the data fetcher**

Modify imports and exports in `src/lib/data/sanity.ts`:

```ts
import {
  FILMS_QUERY,
  FILM_BY_SLUG_QUERY,
  FEATURED_FILMS_QUERY,
  FILM_COLLECTIONS_QUERY,
  ALL_FILM_SLUGS_QUERY,
  PROGRAM_BY_SLUG_QUERY,
  ALL_PROGRAMS_CMS_QUERY,
  TEAM_MEMBERS_QUERY,
  TEAM_MEMBER_BY_SLUG_QUERY,
  ALL_TEAM_MEMBER_SLUGS_QUERY,
  PARTNERS_QUERY,
  FEATURED_PARTNERS_QUERY,
} from "@/lib/sanity/queries";
```

After running typegen in the next step, also import and export the generated collection type:

```ts
import type {
  FILMS_QUERY_RESULT,
  FILM_BY_SLUG_QUERY_RESULT,
  FEATURED_FILMS_QUERY_RESULT,
  FILM_COLLECTIONS_QUERY_RESULT,
  PROGRAM_BY_SLUG_QUERY_RESULT,
  ALL_PROGRAMS_CMS_QUERY_RESULT,
  TEAM_MEMBERS_QUERY_RESULT,
  TEAM_MEMBER_BY_SLUG_QUERY_RESULT,
  PARTNERS_QUERY_RESULT,
  FEATURED_PARTNERS_QUERY_RESULT,
} from "@/../sanity.types";
```

Add these exports near the films types:

```ts
export type FeaturedFilm = FEATURED_FILMS_QUERY_RESULT[number];
export type FilmCollection = FILM_COLLECTIONS_QUERY_RESULT[number];
```

Add this fetcher after `getFeaturedFilms()`:

```ts
export const getFilmCollections = cache(async function getFilmCollections() {
  const { data } = await sanityFetch({ query: FILM_COLLECTIONS_QUERY });
  return data;
});
```

- [ ] **Step 2.5: Regenerate Sanity types**

Run:

```bash
npm run typegen
```

Expected: `sanity.types.ts` updates with the new `FILM_COLLECTIONS_QUERY_RESULT` type and the added film fields.

- [ ] **Step 2.6: Run data and schema tests**

Run:

```bash
npm run test:unit -- src/lib/sanity/schemas/schemas.test.ts src/lib/data/sanity.test.ts
```

Expected: PASS.

- [ ] **Step 2.7: Commit query and type changes**

Run:

```bash
git add src/lib/sanity/queries.ts src/lib/data/sanity.ts src/lib/data/sanity.test.ts sanity.types.ts
git commit -m "feat: add film collection queries"
```

Expected: commit succeeds with only query, data, test, and generated type changes.

---

## Task 3: Films Helper Layer

**Files:**
- Create `src/lib/films/types.ts`
- Create `src/lib/films/embed.ts`
- Create `src/lib/films/embed.test.ts`
- Create `src/lib/films/filtering.ts`
- Create `src/lib/films/filtering.test.ts`
- Create `src/lib/films/rows.ts`
- Create `src/lib/films/rows.test.ts`

- [ ] **Step 3.1: Create shared UI-facing film types**

Create `src/lib/films/types.ts`:

```ts
import type { SanityImageSource } from "@sanity/image-url";

export type FilmMetadataKey = "locations" | "subjects" | "formats" | "skills";

export type FilmStatus = "published" | "in-production" | "coming-soon";

export type FilmBrowserFilm = {
  _id: string;
  title: string | null;
  slug?: { current?: string | null } | null;
  tagline?: string | null;
  heroImage?: (SanityImageSource & { alt?: string | null }) | null;
  thumbnailImage?: (SanityImageSource & { alt?: string | null }) | null;
  videoEmbed?: string | null;
  duration?: string | null;
  releaseYear?: number | null;
  status?: FilmStatus | string | null;
  featured?: boolean | null;
  sortOrder?: number | null;
  locations?: string[] | null;
  subjects?: string[] | null;
  formats?: string[] | null;
  skills?: string[] | null;
  displayTags?: string[] | null;
};

export type FilmBrowserCollection = {
  _id: string;
  title: string | null;
  slug?: { current?: string | null } | null;
  description?: string | null;
  sortOrder?: number | null;
  films?: FilmBrowserFilm[] | null;
};

export type FilmFilterState = Record<FilmMetadataKey, string[]>;

export type FilmFilterOptions = Record<FilmMetadataKey, string[]>;

export type FilmRow = {
  id: string;
  title: string;
  description?: string | null;
  films: FilmBrowserFilm[];
};
```

- [ ] **Step 3.2: Write failing embed tests**

Create `src/lib/films/embed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getSafeFilmEmbedUrl } from "./embed";

describe("getSafeFilmEmbedUrl", () => {
  it("normalizes YouTube watch URLs", () => {
    expect(getSafeFilmEmbedUrl("https://www.youtube.com/watch?v=abc123DEF45")).toBe(
      "https://www.youtube.com/embed/abc123DEF45",
    );
  });

  it("normalizes youtu.be URLs", () => {
    expect(getSafeFilmEmbedUrl("https://youtu.be/abc123DEF45")).toBe(
      "https://www.youtube.com/embed/abc123DEF45",
    );
  });

  it("normalizes YouTube shorts URLs", () => {
    expect(getSafeFilmEmbedUrl("https://www.youtube.com/shorts/abc123DEF45")).toBe(
      "https://www.youtube.com/embed/abc123DEF45",
    );
  });

  it("accepts existing YouTube embed URLs", () => {
    expect(getSafeFilmEmbedUrl("https://www.youtube.com/embed/abc123DEF45")).toBe(
      "https://www.youtube.com/embed/abc123DEF45",
    );
  });

  it("normalizes Vimeo URLs", () => {
    expect(getSafeFilmEmbedUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });

  it("accepts existing Vimeo player URLs", () => {
    expect(getSafeFilmEmbedUrl("https://player.vimeo.com/video/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });

  it("trims surrounding whitespace and strips query/hash from canonical output", () => {
    expect(getSafeFilmEmbedUrl(" https://youtu.be/abc123DEF45?t=12#clip ")).toBe(
      "https://www.youtube.com/embed/abc123DEF45",
    );
  });

  it("rejects non-https URLs", () => {
    expect(getSafeFilmEmbedUrl("http://www.youtube.com/watch?v=abc123DEF45")).toBeNull();
  });

  it("rejects unsupported hosts", () => {
    expect(getSafeFilmEmbedUrl("https://example.com/video")).toBeNull();
  });

  it("rejects allowlisted hosts with missing or malformed IDs", () => {
    expect(getSafeFilmEmbedUrl("https://www.youtube.com/watch")).toBeNull();
    expect(getSafeFilmEmbedUrl("https://www.youtube.com/embed/abc123DEF45/extra")).toBeNull();
    expect(getSafeFilmEmbedUrl("https://vimeo.com/not-a-number")).toBeNull();
    expect(getSafeFilmEmbedUrl("https://player.vimeo.com/video/123456789/extra")).toBeNull();
  });
});
```

- [ ] **Step 3.3: Implement embed helper**

Create `src/lib/films/embed.ts`:

```ts
const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{6,}$/;
const VIMEO_ID_PATTERN = /^[0-9]+$/;

function cleanSegment(segment: string | undefined): string | null {
  if (!segment) return null;
  const value = segment.trim();
  return value.length > 0 ? value : null;
}

export function getSafeFilmEmbedUrl(input: string | null | undefined): string | null {
  if (!input) return null;

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;

  const hostname = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (hostname === "www.youtube.com" || hostname === "youtube.com") {
    const embedId =
      segments[0] === "embed" && segments.length === 2
        ? cleanSegment(segments[1])
        : segments[0] === "shorts" && segments.length === 2
          ? cleanSegment(segments[1])
          : segments.length === 0
            ? cleanSegment(url.searchParams.get("v") ?? undefined)
            : null;

    if (!embedId || !YOUTUBE_ID_PATTERN.test(embedId)) return null;
    return `https://www.youtube.com/embed/${embedId}`;
  }

  if (hostname === "youtu.be") {
    if (segments.length !== 1) return null;
    const embedId = cleanSegment(segments[0]);
    if (!embedId || !YOUTUBE_ID_PATTERN.test(embedId)) return null;
    return `https://www.youtube.com/embed/${embedId}`;
  }

  if (hostname === "player.vimeo.com") {
    const videoId = segments[0] === "video" && segments.length === 2 ? cleanSegment(segments[1]) : null;
    if (!videoId || !VIMEO_ID_PATTERN.test(videoId)) return null;
    return `https://player.vimeo.com/video/${videoId}`;
  }

  if (hostname === "vimeo.com") {
    if (segments.length !== 1) return null;
    const videoId = cleanSegment(segments[0]);
    if (!videoId || !VIMEO_ID_PATTERN.test(videoId)) return null;
    return `https://player.vimeo.com/video/${videoId}`;
  }

  return null;
}
```

- [ ] **Step 3.4: Write failing filtering tests**

Create `src/lib/films/filtering.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createEmptyFilmFilters,
  buildFilmFilterOptions,
  countActiveFilmFilters,
  filterFilms,
  toggleFilmFilter,
} from "./filtering";
import type { FilmBrowserFilm } from "./types";

const films: FilmBrowserFilm[] = [
  {
    _id: "film-1",
    title: "Whales of Faial",
    tagline: "A blue-water documentary",
    locations: [" Azores ", "azores"],
    subjects: ["Whales", "Conservation", " whales "],
    formats: ["Documentary"],
    skills: ["Filming"],
    displayTags: ["Ocean story"],
    releaseYear: 2026,
  },
  {
    _id: "film-2",
    title: "Freedive Training",
    tagline: "Technique under pressure",
    locations: ["Indonesia"],
    subjects: ["Freediving"],
    formats: ["Tutorial"],
    skills: ["Breath-hold", "Equalization"],
    displayTags: ["Training"],
    releaseYear: 2025,
  },
];

describe("film filtering", () => {
  it("creates empty filters for every metadata group", () => {
    expect(createEmptyFilmFilters()).toEqual({
      locations: [],
      subjects: [],
      formats: [],
      skills: [],
    });
  });

  it("derives sorted unique filter options", () => {
    expect(buildFilmFilterOptions(films)).toEqual({
      locations: ["Azores", "Indonesia"],
      subjects: ["Conservation", "Freediving", "Whales"],
      formats: ["Documentary", "Tutorial"],
      skills: ["Breath-hold", "Equalization", "Filming"],
    });
  });

  it("matches search across title, tagline, and metadata", () => {
    expect(filterFilms(films, "blue-water", createEmptyFilmFilters()).map((film) => film._id)).toEqual(["film-1"]);
    expect(filterFilms(films, "equalization", createEmptyFilmFilters()).map((film) => film._id)).toEqual(["film-2"]);
  });

  it("applies selected filters as OR within a group and AND across groups", () => {
    const filters = {
      ...createEmptyFilmFilters(),
      locations: ["Azores", "Indonesia"],
      formats: ["Documentary"],
    };

    expect(filterFilms(films, "", filters).map((film) => film._id)).toEqual(["film-1"]);
  });

  it("toggles filter values immutably", () => {
    const selected = toggleFilmFilter(createEmptyFilmFilters(), "locations", "Azores");
    expect(selected.locations).toEqual(["Azores"]);
    expect(toggleFilmFilter(selected, "locations", "Azores").locations).toEqual([]);
  });

  it("counts active filter values", () => {
    expect(
      countActiveFilmFilters({
        locations: ["Azores"],
        subjects: ["Whales", "Conservation"],
        formats: [],
        skills: [],
      }),
    ).toBe(3);
  });
});
```

- [ ] **Step 3.5: Implement filtering helper**

Create `src/lib/films/filtering.ts`:

```ts
import type {
  FilmBrowserFilm,
  FilmFilterOptions,
  FilmFilterState,
  FilmMetadataKey,
} from "./types";

export const FILM_METADATA_KEYS: FilmMetadataKey[] = [
  "locations",
  "subjects",
  "formats",
  "skills",
];

export function createEmptyFilmFilters(): FilmFilterState {
  return {
    locations: [],
    subjects: [],
    formats: [],
    skills: [],
  };
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanMetadataValue(value: string): string | null {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : null;
}

function valuesFor(film: FilmBrowserFilm, key: FilmMetadataKey): string[] {
  const values = film[key] ?? [];
  const seen = new Set<string>();
  const cleanedValues: string[] = [];

  for (const value of values) {
    if (!value) continue;
    const cleaned = cleanMetadataValue(value);
    if (!cleaned) continue;
    const normalized = normalizeText(cleaned);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    cleanedValues.push(cleaned);
  }

  return cleanedValues;
}

function searchableValues(film: FilmBrowserFilm): string[] {
  return [
    film.title,
    film.tagline,
    film.duration,
    film.releaseYear ? String(film.releaseYear) : null,
    ...(film.displayTags ?? []),
    ...FILM_METADATA_KEYS.flatMap((key) => valuesFor(film, key)),
  ].filter((value): value is string => Boolean(value?.trim()));
}

export function buildFilmFilterOptions(films: FilmBrowserFilm[]): FilmFilterOptions {
  return FILM_METADATA_KEYS.reduce((options, key) => {
    const byNormalized = new Map<string, string>();
    for (const value of films.flatMap((film) => valuesFor(film, key))) {
      byNormalized.set(normalizeText(value), value);
    }
    options[key] = Array.from(byNormalized.values()).sort((a, b) => a.localeCompare(b));
    return options;
  }, createEmptyFilmFilters());
}

export function countActiveFilmFilters(filters: FilmFilterState): number {
  return FILM_METADATA_KEYS.reduce((count, key) => count + filters[key].length, 0);
}

export function toggleFilmFilter(
  filters: FilmFilterState,
  key: FilmMetadataKey,
  value: string,
): FilmFilterState {
  const selected = new Set(filters[key]);
  if (selected.has(value)) {
    selected.delete(value);
  } else {
    selected.add(value);
  }

  return {
    ...filters,
    [key]: Array.from(selected),
  };
}

function filmMatchesSearch(film: FilmBrowserFilm, search: string): boolean {
  const query = normalizeText(search);
  if (!query) return true;

  return searchableValues(film).some((value) => normalizeText(value).includes(query));
}

function filmMatchesFilters(film: FilmBrowserFilm, filters: FilmFilterState): boolean {
  return FILM_METADATA_KEYS.every((key) => {
    const selected = filters[key];
    if (selected.length === 0) return true;
    const filmValues = new Set(valuesFor(film, key).map(normalizeText));
    return selected.some((value) => filmValues.has(normalizeText(value)));
  });
}

export function filterFilms(
  films: FilmBrowserFilm[],
  search: string,
  filters: FilmFilterState,
): FilmBrowserFilm[] {
  return films.filter((film) => filmMatchesSearch(film, search) && filmMatchesFilters(film, filters));
}
```

- [ ] **Step 3.6: Write failing row tests**

Create `src/lib/films/rows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildFilmRows } from "./rows";
import type { FilmBrowserCollection, FilmBrowserFilm } from "./types";

const films: FilmBrowserFilm[] = [
  { _id: "film-1", title: "Featured One", featured: true, releaseYear: 2024, sortOrder: 2 },
  { _id: "film-2", title: "Latest One", featured: false, releaseYear: 2026, sortOrder: 1 },
  { _id: "film-3", title: "Featured Two", featured: true, releaseYear: 2025, sortOrder: 3 },
];

describe("buildFilmRows", () => {
  it("puts curated collections before fallback rows", () => {
    const collections: FilmBrowserCollection[] = [
      {
        _id: "collection-1",
        title: "Ocean Stories",
        description: "Curated row",
        films: [films[1], films[0]],
      },
    ];

    expect(buildFilmRows(films, collections).map((row) => row.title)).toEqual([
      "Ocean Stories",
      "Featured",
      "Latest",
      "All Films",
    ]);
  });

  it("removes empty curated collections", () => {
    expect(
      buildFilmRows(films, [{ _id: "collection-1", title: "Empty", films: [] }]).map((row) => row.title),
    ).not.toContain("Empty");
  });

  it("filters curated collection films to the visible film set", () => {
    const rows = buildFilmRows([films[0]], [
      {
        _id: "collection-1",
        title: "Filtered Collection",
        films: [films[0], films[1]],
      },
    ]);

    expect(rows[0]).toMatchObject({
      id: "collection-collection-1",
      title: "Filtered Collection",
    });
    expect(rows[0].films.map((film) => film._id)).toEqual(["film-1"]);
  });

  it("sorts latest by release year descending", () => {
    const latest = buildFilmRows(films, []).find((row) => row.id === "latest");
    expect(latest?.films.map((film) => film._id)).toEqual(["film-2", "film-3", "film-1"]);
  });

  it("omits Featured row when no films are featured", () => {
    const rows = buildFilmRows(
      films.map((film) => ({ ...film, featured: false })),
      [],
    );
    expect(rows.map((row) => row.id)).toEqual(["latest", "all"]);
  });
});
```

- [ ] **Step 3.7: Implement row helper**

Create `src/lib/films/rows.ts`:

```ts
import type { FilmBrowserCollection, FilmBrowserFilm, FilmRow } from "./types";

function sortByReleaseYearDesc(films: FilmBrowserFilm[]): FilmBrowserFilm[] {
  return [...films].sort((a, b) => {
    const yearDelta = (b.releaseYear ?? 0) - (a.releaseYear ?? 0);
    if (yearDelta !== 0) return yearDelta;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

function sortBySortOrder(films: FilmBrowserFilm[]): FilmBrowserFilm[] {
  return [...films].sort((a, b) => {
    const orderDelta = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDelta !== 0) return orderDelta;
    return (b.releaseYear ?? 0) - (a.releaseYear ?? 0);
  });
}

function hasTitle(title: string | null | undefined): title is string {
  return Boolean(title?.trim());
}

export function buildFilmRows(
  films: FilmBrowserFilm[],
  collections: FilmBrowserCollection[],
): FilmRow[] {
  const visibleFilmIds = new Set(films.map((film) => film._id));
  const curatedRows: FilmRow[] = collections
    .filter((collection) => hasTitle(collection.title))
    .map((collection) => ({
      id: `collection-${collection._id}`,
      title: collection.title!,
      description: collection.description,
      films:
        collection.films?.filter(
          (film): film is FilmBrowserFilm => Boolean(film?._id) && visibleFilmIds.has(film._id),
        ) ?? [],
    }))
    .filter((row) => row.films.length > 0);

  const featured = sortBySortOrder(films.filter((film) => film.featured));
  const latest = sortByReleaseYearDesc(films);
  const all = sortBySortOrder(films);

  return [
    ...curatedRows,
    ...(featured.length > 0 ? [{ id: "featured", title: "Featured", films: featured }] : []),
    ...(latest.length > 0 ? [{ id: "latest", title: "Latest", films: latest }] : []),
    ...(all.length > 0 ? [{ id: "all", title: "All Films", films: all }] : []),
  ];
}
```

- [ ] **Step 3.8: Run helper tests**

Run:

```bash
npm run test:unit -- src/lib/films/embed.test.ts src/lib/films/filtering.test.ts src/lib/films/rows.test.ts
```

Expected: PASS.

- [ ] **Step 3.9: Commit helper layer**

Run:

```bash
git add src/lib/films/types.ts src/lib/films/embed.ts src/lib/films/embed.test.ts src/lib/films/filtering.ts src/lib/films/filtering.test.ts src/lib/films/rows.ts src/lib/films/rows.test.ts
git commit -m "feat: add film browsing helpers"
```

Expected: commit succeeds with only films helper files staged.

---

## Task 4: Dialog and Sheet UI Primitives

**Files:**
- Create `src/components/ui/dialog.tsx`
- Create `src/components/ui/sheet.tsx`

- [ ] **Step 4.1: Create Dialog primitive**

Create `src/components/ui/dialog.tsx`:

```tsx
"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/70 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border border-border bg-background p-0 shadow-2xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close className="absolute right-3 top-3 rounded-full bg-background/80 p-2 text-foreground shadow-sm transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
```

- [ ] **Step 4.2: Create Sheet primitive**

Create `src/components/ui/sheet.tsx`:

```tsx
"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal(props: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-6 overflow-y-auto border-l border-border bg-background p-6 shadow-2xl outline-none data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right sm:max-w-lg",
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute right-4 top-4 rounded-full p-2 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 pr-10", className)} {...props} />;
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
```

- [ ] **Step 4.3: Run lint for new primitives**

Run:

```bash
npm run lint -- src/components/ui/dialog.tsx src/components/ui/sheet.tsx
```

Expected: PASS.

- [ ] **Step 4.4: Commit UI primitives**

Run:

```bash
git add src/components/ui/dialog.tsx src/components/ui/sheet.tsx
git commit -m "feat: add dialog and sheet primitives"
```

Expected: commit succeeds with only the new UI primitive files staged.

---

## Task 5: Films Browser Components

**Files:**
- Create `src/components/films/FilmPoster.tsx`
- Create `src/components/films/FilmCard.tsx`
- Create `src/components/films/FilmRow.tsx`
- Create `src/components/films/FilmFilterSheet.tsx`
- Create `src/components/films/FilmPlaybackModal.tsx`
- Create `src/components/films/FilmsBrowser.tsx`

- [ ] **Step 5.1: Create poster component**

Create `src/components/films/FilmPoster.tsx`:

```tsx
import { SanityImage } from "@/components/sanity/SanityImage";
import type { FilmBrowserFilm } from "@/lib/films/types";
import { cn } from "@/lib/utils";

type FilmPosterProps = {
  film: FilmBrowserFilm;
  className?: string;
  sizes: string;
  priority?: boolean;
};

export function FilmPoster({ film, className, sizes, priority = false }: FilmPosterProps) {
  const image = film.thumbnailImage ?? film.heroImage;
  const alt = image?.alt ?? film.title ?? "Film poster";

  if (!image) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-900 via-slate-800 to-primary/60 p-4 text-center text-sm font-medium text-white",
          className,
        )}
      >
        {film.title ?? "Untitled film"}
      </div>
    );
  }

  return (
    <SanityImage
      source={image}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      className={cn("object-cover", className)}
    />
  );
}
```

- [ ] **Step 5.2: Create card component**

Create `src/components/films/FilmCard.tsx`:

```tsx
"use client";

import { PlayIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FilmBrowserFilm } from "@/lib/films/types";
import { cn } from "@/lib/utils";
import { FilmPoster } from "./FilmPoster";

type FilmCardProps = {
  film: FilmBrowserFilm;
  onSelect: (film: FilmBrowserFilm) => void;
};

function visibleTags(film: FilmBrowserFilm): string[] {
  const tags = film.displayTags?.filter(Boolean) ?? [];
  if (tags.length > 0) return tags.slice(0, 3);

  return [
    ...(film.locations ?? []),
    ...(film.subjects ?? []),
    ...(film.formats ?? []),
  ].filter(Boolean).slice(0, 3);
}

export function FilmCard({ film, onSelect }: FilmCardProps) {
  const tags = visibleTags(film);

  return (
    <button
      type="button"
      aria-label={`Play ${film.title ?? "Untitled film"}`}
      onClick={() => onSelect(film)}
      className={cn(
        "group relative w-[78vw] max-w-[320px] shrink-0 overflow-hidden rounded-lg bg-background text-left shadow-sm ring-1 ring-border transition-transform duration-200 hover:z-10 hover:scale-[1.03] focus-visible:z-10 focus-visible:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[300px]",
      )}
    >
      <div className="relative aspect-video overflow-hidden bg-neutral-900">
        <FilmPoster film={film} sizes="320px" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-70" />
        <div className="absolute bottom-3 left-3 flex size-9 items-center justify-center rounded-full bg-white/90 text-neutral-950 shadow-sm">
          <PlayIcon className="ml-0.5 size-4 fill-current" />
        </div>
      </div>

      <div className="space-y-2 p-4">
        <div>
          <h3 className="line-clamp-1 text-sm font-semibold text-foreground">
            {film.title ?? "Untitled film"}
          </h3>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {[film.releaseYear, film.duration].filter(Boolean).join(" / ")}
          </p>
        </div>

        {film.tagline && (
          <p className="line-clamp-2 text-xs text-muted-foreground opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
            {film.tagline}
          </p>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <Button
          asChild
          size="sm"
          className="pointer-events-none hidden opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:inline-flex"
        >
          <span>
            <PlayIcon data-icon="inline-start" />
            Play
          </span>
        </Button>
      </div>
    </button>
  );
}
```

- [ ] **Step 5.3: Create horizontal row component**

Create `src/components/films/FilmRow.tsx`:

```tsx
"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import type { FilmBrowserFilm, FilmRow as FilmRowType } from "@/lib/films/types";
import { FilmCard } from "./FilmCard";

type FilmRowProps = {
  row: FilmRowType;
  onSelectFilm: (film: FilmBrowserFilm) => void;
};

export function FilmRow({ row, onSelectFilm }: FilmRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollByCard(direction: -1 | 1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: direction * 340, behavior: "smooth" });
  }

  return (
    <section className="space-y-4" aria-labelledby={`${row.id}-heading`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id={`${row.id}-heading`} className="text-xl font-semibold text-foreground">
            {row.title}
          </h2>
          {row.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{row.description}</p>
          )}
        </div>
        <div className="hidden gap-2 md:flex">
          <Button type="button" variant="outline" size="icon-sm" onClick={() => scrollByCard(-1)}>
            <ChevronLeftIcon />
            <span className="sr-only">Scroll {row.title} left</span>
          </Button>
          <Button type="button" variant="outline" size="icon-sm" onClick={() => scrollByCard(1)}>
            <ChevronRightIcon />
            <span className="sr-only">Scroll {row.title} right</span>
          </Button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-5 pt-1 [scrollbar-width:none] md:-mx-8 md:px-8 [&::-webkit-scrollbar]:hidden"
      >
        {row.films.map((film) => (
          <FilmCard key={film._id} film={film} onSelect={onSelectFilm} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5.4: Create filter sheet component**

Create `src/components/films/FilmFilterSheet.tsx`:

```tsx
"use client";

import { SlidersHorizontalIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  FILM_METADATA_KEYS,
  countActiveFilmFilters,
  createEmptyFilmFilters,
  toggleFilmFilter,
} from "@/lib/films/filtering";
import type { FilmFilterOptions, FilmFilterState, FilmMetadataKey } from "@/lib/films/types";

const FILTER_LABELS: Record<FilmMetadataKey, string> = {
  locations: "Location",
  subjects: "Subject",
  formats: "Format",
  skills: "Skill",
};

type FilmFilterSheetProps = {
  options: FilmFilterOptions;
  filters: FilmFilterState;
  onChange: (filters: FilmFilterState) => void;
};

export function FilmFilterSheet({ options, filters, onChange }: FilmFilterSheetProps) {
  const activeCount = countActiveFilmFilters(filters);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Sheet>
        <SheetTrigger asChild>
          <Button type="button" variant="outline">
            <SlidersHorizontalIcon data-icon="inline-start" />
            Filters
            {activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filter films</SheetTitle>
            <SheetDescription>Refine the catalog by location, subject, format, and skill.</SheetDescription>
          </SheetHeader>

          <div className="space-y-6">
            {FILM_METADATA_KEYS.map((key) => (
              <fieldset key={key} className="space-y-3">
                <legend className="text-sm font-medium text-foreground">{FILTER_LABELS[key]}</legend>
                <div className="space-y-2">
                  {options[key].map((value) => {
                    const checked = filters[key].includes(value);
                    return (
                      <label key={value} className="flex items-center gap-3 text-sm text-foreground">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => onChange(toggleFilmFilter(filters, key, value))}
                        />
                        <span>{value}</span>
                      </label>
                    );
                  })}
                  {options[key].length === 0 && (
                    <p className="text-sm text-muted-foreground">No {FILTER_LABELS[key].toLowerCase()} filters yet.</p>
                  )}
                </div>
              </fieldset>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {FILM_METADATA_KEYS.flatMap((key) =>
        filters[key].map((value) => (
          <button
            key={`${key}-${value}`}
            type="button"
            onClick={() => onChange(toggleFilmFilter(filters, key, value))}
            className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            {value} x
          </button>
        )),
      )}

      {activeCount > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(createEmptyFilmFilters())}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 5.5: Create playback modal component**

Create `src/components/films/FilmPlaybackModal.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSafeFilmEmbedUrl } from "@/lib/films/embed";
import type { FilmBrowserFilm } from "@/lib/films/types";

type FilmPlaybackModalProps = {
  film: FilmBrowserFilm | null;
  onOpenChange: (open: boolean) => void;
};

function filmHref(film: FilmBrowserFilm): string | null {
  const slug = film.slug?.current;
  return slug ? `/films/${slug}` : null;
}

function tagsFor(film: FilmBrowserFilm): string[] {
  return [
    ...(film.displayTags ?? []),
    ...(film.locations ?? []),
    ...(film.subjects ?? []),
    ...(film.formats ?? []),
  ].filter(Boolean).slice(0, 8);
}

export function FilmPlaybackModal({ film, onOpenChange }: FilmPlaybackModalProps) {
  const open = Boolean(film);
  const embedUrl = getSafeFilmEmbedUrl(film?.videoEmbed);
  const href = film ? filmHref(film) : null;
  const tags = film ? tagsFor(film) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden bg-neutral-950 text-white sm:rounded-lg">
        {film && (
          <div>
            <div className="aspect-video bg-black">
              {embedUrl ? (
                <iframe
                  src={embedUrl}
                  title={film.title ?? "Film video"}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  sandbox="allow-scripts allow-same-origin allow-presentation"
                  allowFullScreen
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-300">
                  Video unavailable. Check the film embed URL in Sanity.
                </div>
              )}
            </div>

            <div className="space-y-5 p-5 md:p-7">
              <DialogHeader>
                <DialogTitle className="text-2xl text-white">{film.title ?? "Untitled film"}</DialogTitle>
                {film.tagline && (
                  <DialogDescription className="text-neutral-300">{film.tagline}</DialogDescription>
                )}
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-300">
                {film.releaseYear && <span>{film.releaseYear}</span>}
                {film.duration && <span>{film.duration}</span>}
                {film.status === "in-production" && <Badge variant="secondary">In Production</Badge>}
                {film.status === "coming-soon" && <Badge variant="secondary">Coming Soon</Badge>}
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="border-white/20 bg-white/10 text-white">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {href && (
                <Button asChild variant="secondary">
                  <Link href={href}>
                    More details
                    <ExternalLinkIcon data-icon="inline-end" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5.6: Create browser component**

Create `src/components/films/FilmsBrowser.tsx`:

```tsx
"use client";

import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  buildFilmFilterOptions,
  createEmptyFilmFilters,
  filterFilms,
} from "@/lib/films/filtering";
import { buildFilmRows } from "@/lib/films/rows";
import type {
  FilmBrowserCollection,
  FilmBrowserFilm,
  FilmFilterState,
} from "@/lib/films/types";
import { FilmFilterSheet } from "./FilmFilterSheet";
import { FilmPlaybackModal } from "./FilmPlaybackModal";
import { FilmRow } from "./FilmRow";

type FilmsBrowserProps = {
  films: FilmBrowserFilm[];
  collections: FilmBrowserCollection[];
};

export function FilmsBrowser({ films, collections }: FilmsBrowserProps) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilmFilterState>(() => createEmptyFilmFilters());
  const [activeFilm, setActiveFilm] = useState<FilmBrowserFilm | null>(null);

  const filterOptions = useMemo(() => buildFilmFilterOptions(films), [films]);
  const visibleFilms = useMemo(() => filterFilms(films, search, filters), [films, search, filters]);
  const hasActiveQuery = search.trim().length > 0 || Object.values(filters).some((values) => values.length > 0);
  const rows = useMemo(
    () =>
      hasActiveQuery
        ? visibleFilms.length > 0
          ? [{ id: "matches", title: "Matching Films", films: visibleFilms }]
          : []
        : buildFilmRows(visibleFilms, collections),
    [collections, hasActiveQuery, visibleFilms],
  );

  return (
    <div className="space-y-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <label className="relative block">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search films</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, subject, location..."
            className="h-12 w-full rounded-lg border border-border bg-background pl-11 pr-4 text-sm text-foreground shadow-sm outline-none transition-shadow focus:ring-2 focus:ring-ring"
          />
        </label>

        <FilmFilterSheet options={filterOptions} filters={filters} onChange={setFilters} />
      </div>

      {rows.length > 0 ? (
        <div className="space-y-12">
          {rows.map((row) => (
            <FilmRow key={row.id} row={row} onSelectFilm={setActiveFilm} />
          ))}
        </div>
      ) : (
        <div className="mx-auto max-w-md rounded-lg border border-border bg-background p-8 text-center">
          <h2 className="text-lg font-semibold text-foreground">No films match your search</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Adjust the search or filters to browse the full catalog.
          </p>
          {hasActiveQuery && (
            <Button
              type="button"
              variant="outline"
              className="mt-5"
              onClick={() => {
                setSearch("");
                setFilters(createEmptyFilmFilters());
              }}
            >
              Reset search and filters
            </Button>
          )}
        </div>
      )}

      <FilmPlaybackModal film={activeFilm} onOpenChange={(open) => !open && setActiveFilm(null)} />
    </div>
  );
}
```

- [ ] **Step 5.7: Run lint and build feedback**

Run:

```bash
npm run lint -- src/components/films src/components/ui/dialog.tsx src/components/ui/sheet.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 5.8: Commit films components**

Run:

```bash
git add src/components/films/FilmPoster.tsx src/components/films/FilmCard.tsx src/components/films/FilmRow.tsx src/components/films/FilmFilterSheet.tsx src/components/films/FilmPlaybackModal.tsx src/components/films/FilmsBrowser.tsx
git commit -m "feat: add films browsing components"
```

Expected: commit succeeds with only films component files staged.

---

## Task 6: Route Integration

**Files:**
- Modify `src/app/(marketing)/films/page.tsx`
- Modify `src/app/(marketing)/films/[slug]/page.tsx`

- [ ] **Step 6.1: Integrate the browser on `/films`**

Modify `src/app/(marketing)/films/page.tsx`:

```tsx
import type { Metadata } from "next";
import { FilmsBrowser } from "@/components/films/FilmsBrowser";
import { getFilmCollections, getFilms } from "@/lib/data/sanity";

export const metadata: Metadata = {
  title: "Films - Behind The Mask",
  description: "Explore our underwater film portfolio.",
};

export default async function FilmsPage() {
  const [films, collections] = await Promise.all([
    getFilms(),
    getFilmCollections(),
  ]);

  if (!films || films.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-5 py-20">
        <h1 className="mb-4 text-[length:var(--font-size-h1)] font-medium text-foreground">
          Films
        </h1>
        <p className="max-w-md text-center text-muted-foreground">
          Our film portfolio is coming soon. Check back later.
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-muted px-5 py-16 md:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl space-y-12">
        <header className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-wide text-primary">
            Films
          </p>
          <h1 className="text-[length:var(--font-size-h1)] font-medium text-foreground">
            Stories captured beneath the surface
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Explore our underwater film portfolio through expeditions, conservation stories,
            behind-the-scenes craft, and field tutorials.
          </p>
        </header>

        <FilmsBrowser films={films} collections={collections ?? []} />
      </div>
    </main>
  );
}
```

- [ ] **Step 6.2: Reuse safe embed helper on detail pages**

Modify the top of `src/app/(marketing)/films/[slug]/page.tsx`:

```tsx
import { getSafeFilmEmbedUrl } from "@/lib/films/embed";
```

Remove the local `ALLOWED_EMBED_HOSTS` and `isAllowedEmbedUrl()` implementation.

Inside the component after the `film` null check, add:

```tsx
const embedUrl = getSafeFilmEmbedUrl(film.videoEmbed);
```

Replace the video block with:

```tsx
{embedUrl && (
  <div className="mb-12 aspect-video overflow-hidden rounded-xl">
    <iframe
      src={embedUrl}
      title={film.title ?? "Video"}
      className="h-full w-full"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      sandbox="allow-scripts allow-same-origin allow-presentation"
      allowFullScreen
    />
  </div>
)}
```

- [ ] **Step 6.3: Run route-related tests and lint**

Run:

```bash
npm run test:unit -- src/lib/films/embed.test.ts src/lib/films/filtering.test.ts src/lib/films/rows.test.ts src/lib/data/sanity.test.ts
npm run lint -- src/app/\(marketing\)/films src/components/films src/lib/films
npm run build
```

Expected: all commands PASS.

- [ ] **Step 6.4: Commit route integration**

Run:

```bash
git add src/app/\(marketing\)/films/page.tsx src/app/\(marketing\)/films/\[slug\]/page.tsx
git commit -m "feat: integrate films browser route"
```

Expected: commit succeeds with only route files staged.

---

## Task 7: E2E Coverage and Final Verification

**Files:**
- Modify `e2e/sanity-pages.spec.ts`

- [ ] **Step 7.1: Extend films smoke tests**

Modify the films test in `e2e/sanity-pages.spec.ts`:

```ts
test("films page loads", async ({ page }) => {
  await page.goto("/films");
  await expect(page.getByRole("heading", { name: /stories captured beneath the surface|films/i })).toBeVisible();

  const emptyState = page.getByText(/our film portfolio is coming soon/i);
  if (await emptyState.isVisible()) {
    await expect(emptyState).toBeVisible();
    return;
  }

  const search = page.getByLabel("Search films");
  await expect(search).toBeVisible();
  await expect(page.getByRole("button", { name: /filters/i })).toBeVisible();
});
```

Add this test in the same `test.describe("CMS pages", () => { ... })` block:

```ts
test("films page filter controls remain usable", async ({ page }) => {
  await page.goto("/films");

  const search = page.getByLabel("Search films");
  if ((await search.count()) === 0) {
    test.skip(true, "No Sanity films are available in this environment.");
  }

  await search.fill("unlikely-search-value-no-films");

  await expect(page.getByText(/no films match your search/i)).toBeVisible();
  await page.getByRole("button", { name: /reset search and filters/i }).click();
  await expect(search).toHaveValue("");

  await page.getByRole("button", { name: /filters/i }).click();
  await expect(page.getByRole("dialog", { name: /filter films/i })).toBeVisible();
});
```

Add this test in the same block to cover the hybrid playback interaction when the CMS environment has films:

```ts
test("films page opens and closes the playback modal", async ({ page }) => {
  await page.goto("/films");

  const playButtons = page.getByRole("button", { name: /play .+/i });
  if ((await playButtons.count()) === 0) {
    test.skip(true, "No Sanity films are available in this environment.");
  }

  await playButtons.first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: /more details/i }).or(dialog.getByText(/video unavailable/i))).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
```

- [ ] **Step 7.2: Run unit tests**

Run:

```bash
npm run test:unit -- src/lib/sanity/schemas/schemas.test.ts src/lib/data/sanity.test.ts src/lib/films/embed.test.ts src/lib/films/filtering.test.ts src/lib/films/rows.test.ts
```

Expected: PASS.

- [ ] **Step 7.3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 7.4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7.5: Run focused E2E**

Run:

```bash
npm run test:e2e -- e2e/sanity-pages.spec.ts -g "films"
```

Expected: PASS when local `.env.local` and services required by `playwright.config.ts` are available. If this fails because the existing Playwright web server cannot start due environment configuration, record the exact failure in the final handoff.

- [ ] **Step 7.6: Visual browser check**

Start the dev server if it is not running:

```bash
npm run dev
```

Open `/films` in the browser and verify:

- Search input is visible and does not overlap the header.
- Filters button opens the Sheet-style drawer.
- Horizontal rows scroll on desktop.
- Film cards show poster/title/year/duration without layout shift.
- Hover/focus expansion does not cover adjacent row headings.
- Clicking a card opens the playback modal.
- Invalid or missing video embed shows `Video unavailable. Check the film embed URL in Sanity.`
- `More details` opens the existing detail route when the film has a slug.
- Mobile viewport shows usable cards without relying on hover.

- [ ] **Step 7.7: Commit E2E and any final fixes**

Run:

```bash
git add e2e/sanity-pages.spec.ts
git commit -m "test: cover films browsing controls"
```

If Step 7.2 through Step 7.6 required code fixes, include only the files changed for those fixes in this commit.

---

## Final Handoff Checklist

- [ ] `git status --short --branch` shows only unrelated pre-existing changes or a clean feature branch.
- [ ] `npm run test:unit -- src/lib/sanity/schemas/schemas.test.ts src/lib/data/sanity.test.ts src/lib/films/embed.test.ts src/lib/films/filtering.test.ts src/lib/films/rows.test.ts` passed.
- [ ] `npm run lint` passed.
- [ ] `npm run build` passed.
- [ ] Focused Playwright films tests passed or the exact environment blocker is documented.
- [ ] Manual browser check completed for desktop and mobile viewports.
