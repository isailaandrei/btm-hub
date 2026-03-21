# Headless CMS Integration (Sanity)

Technical documentation for the Sanity CMS integration in BTM Hub.

## Why Sanity

The marketing content on the site (films, team, partners, program showcase pages) needs to be editable by non-developers. Rather than hardcoding this content or building a custom admin UI, we use Sanity as a headless CMS. Key reasons:

- **Embedded Studio** — Sanity Studio runs as a Next.js route (`/studio`), so there's no separate CMS app to deploy or maintain.
- **Real-time previews** — The Presentation Tool + `next-sanity` integration enables live visual editing with stega-encoded click-to-edit overlays.
- **Structured content** — GROQ queries give us full control over what data we fetch, unlike REST APIs that return entire documents.
- **CDN-backed** — Sanity's CDN (`cdn.sanity.io`) serves images and API responses at the edge.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Sanity Studio (/studio)                                │
│  sanity.config.ts → schemas in src/lib/sanity/schemas/  │
└─────────────┬───────────────────────────────────────────┘
              │ publish
              ▼
┌─────────────────────────────┐
│  Sanity Content Lake (API)  │
│  CDN: cdn.sanity.io         │
└──────┬──────────────┬───────┘
       │              │
       │ GROQ fetch   │ webhook POST
       ▼              ▼
┌────────────┐  ┌──────────────────────────────┐
│ sanityFetch│  │ /api/sanity/revalidate       │
│ (defineLive│  │ validates signature, calls    │
│  from      │  │ revalidateTag(type, "max")   │
│  next-sanity)│ └──────────────────────────────┘
└──────┬─────┘
       │
       ▼
┌────────────────────────────────────────┐
│  Data Fetchers (src/lib/data/sanity.ts)│
│  React cache() wrapped, typed results  │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│  Server Components (pages)             │
│  /films, /team, /partners, /academy/*  │
└────────────────────────────────────────┘
```

## File Structure

```
src/lib/sanity/
├── client.ts          # Sanity client (createClient, useCdn: true)
├── env.ts             # Project ID, dataset, API version from env vars
├── image.ts           # urlFor() helper via @sanity/image-url
├── live.ts            # defineLive() → exports sanityFetch + SanityLive
├── portable-text.tsx  # PortableText component overrides
├── queries.ts         # All GROQ queries (defineQuery)
└── schemas/
    ├── index.ts       # Schema registry
    ├── documents/     # film, teamMember, partner, program
    └── objects/       # portableText, gallery, socialLink, faq, testimonial

src/lib/data/
├── sanity.ts          # Data fetchers (getFilms, getTeamMembers, etc.)
└── programs.ts        # Merges static program config with CMS content

src/app/
├── studio/[[...tool]]/page.tsx         # Embedded Sanity Studio
├── api/sanity/revalidate/route.ts      # Webhook handler
├── api/draft-mode/enable/route.ts      # Draft mode endpoint
└── (marketing)/
    ├── films/page.tsx                  # Film grid
    ├── films/[slug]/page.tsx           # Film detail
    ├── team/page.tsx                   # Team members
    ├── partners/page.tsx               # Partners
    └── academy/[program]/page.tsx      # Program detail (hybrid)

src/components/sanity/
└── SanityImage.tsx    # Wrapper around next/image for Sanity assets

sanity.config.ts       # Studio configuration (root)
```

## Data Flow

### 1. Content authoring

Editors use Sanity Studio at `/studio` to create and publish documents. The Studio is an embedded Next.js route (`src/app/studio/[[...tool]]/page.tsx`) configured with `force-static` rendering. It uses the schema definitions in `src/lib/sanity/schemas/`.

### 2. Fetching content

All data fetching goes through `sanityFetch` from `src/lib/sanity/live.ts`, which is the `defineLive()` wrapper from `next-sanity`. This provides:

- **Server-side fetching** with the read token (can access draft content when draft mode is enabled)
- **Automatic cache tagging** by document type (used for webhook revalidation)
- **Stega encoding** for visual editing (only active in draft mode)

Data fetchers in `src/lib/data/sanity.ts` wrap `sanityFetch` with React's `cache()` for per-request deduplication:

```ts
export const getFilms = cache(async function getFilms() {
  const { data } = await sanityFetch({ query: FILMS_QUERY });
  return data as FilmSummary[];
});
```

**Exception:** `getAllFilmSlugs()` uses the plain Sanity client (not `sanityFetch`) because it's called from `generateStaticParams`, which runs at build time outside the request context.

### 3. Cache invalidation

When content is published in Sanity, a webhook sends a signed POST to `/api/sanity/revalidate`. The handler:

1. Validates the signature against `SANITY_REVALIDATE_SECRET`
2. Calls `revalidateTag(body._type, "max")` to invalidate the Next.js cache for that document type
3. The next request to any page fetching that type gets fresh data

**Local development:** The webhook can't reach `localhost`. Restart the dev server to clear the cache after publishing content.

### 4. Rendering

Pages are server components that call data fetchers directly:

```ts
export default async function FilmsPage() {
  const films = await getFilms();
  // render...
}
```

The `SanityLive` component is mounted in the root layout (`src/app/layout.tsx`) to enable live content updates and draft mode previewing.

## Content Models

### Documents

| Type | Description | Key fields |
|------|-------------|------------|
| `film` | Underwater film portfolio entries | title, slug, heroImage, videoEmbed, description (rich text), gallery, credits, status |
| `teamMember` | Team member profiles | name, slug, photo, role (founder/instructor/guide), shortBio, fullBio, socialLinks |
| `partner` | Partner organizations | name, slug, logo, description, website, memberDiscount, tier (platinum/gold/silver/community) |
| `program` | CMS content for academy programs | slug (matches static config), heroImage, fullDescription, curriculum, instructor (→ teamMember), faqs, testimonials |

### Objects (reusable types)

| Type | Used by |
|------|---------|
| `portableText` | Rich text fields (descriptions, bios, curriculum) |
| `gallery` | Film galleries, program galleries |
| `socialLink` | Team member social profiles |
| `faq` | Program FAQ sections |
| `testimonial` | Program testimonials |

### The program hybrid model

Programs use a hybrid approach: static configuration (name, short description, pricing tiers, application fields) lives in `src/lib/academy/programs.ts`, while rich CMS content (hero images, full descriptions, curriculum, FAQs) lives in Sanity. The `getProgramShowcase()` function in `src/lib/data/programs.ts` merges both:

```ts
export const getProgramShowcase = cache(async function getProgramShowcase(slug: string) {
  const config = getProgram(slug);       // static config
  const cms = await getProgramContent(slug); // CMS content
  return { config, cms: cms ?? null };
});
```

This means programs work even without CMS content (they fall back to the static config), and CMS content enriches the page when available.

## Images

Sanity images go through two layers:

1. **`urlFor()`** (`src/lib/sanity/image.ts`) — Builds a Sanity CDN URL with transforms (width, height, quality, format).
2. **`SanityImage`** (`src/components/sanity/SanityImage.tsx`) — Wraps `next/image` with Sanity-specific URL generation.

When `fill={true}` (hero images, portraits), the component requests a 1920px wide image with `auto("format")` for WebP/AVIF delivery. When `fill={false}`, it uses the exact `width`/`height` props.

`next.config.ts` allows `cdn.sanity.io` as a remote image pattern.

## Rich Text

Portable Text blocks from Sanity are rendered using `@portabletext/react` with custom component overrides in `src/lib/sanity/portable-text.tsx`. This covers:

- Block styles: h2, h3, h4, normal, blockquote
- Marks: bold, italic, links
- Types: inline images with captions

**Security:** Links are sanitized at render time via `isSafeUrl()` from `src/lib/validation-helpers.ts` — only `http:`, `https:`, `mailto:`, and relative paths are allowed. This is defense-in-depth on top of the schema-level URL validation.

## Draft Mode & Visual Editing

The integration supports Sanity's Presentation Tool for live visual editing:

1. **`/api/draft-mode/enable`** — Enables Next.js draft mode, called by the Presentation Tool. Requires `SANITY_API_READ_TOKEN`.
2. **`SanityLive`** — Mounted in the root layout, handles live content streaming in draft mode.
3. **`VisualEditing`** — Rendered conditionally when draft mode is active, enables click-to-edit overlays via stega encoding.
4. **Stega** — Invisible Unicode characters embedded in text fields that link back to the Studio field editor. Only active when `draftMode().isEnabled` is true — never in production.

```tsx
// src/app/layout.tsx
<SanityLive />
{draft && <VisualEditing />}
```

## Environment Variables

| Variable | Required | Scope | Purpose |
|----------|----------|-------|---------|
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | Yes | Client + Server | Sanity project identifier |
| `NEXT_PUBLIC_SANITY_DATASET` | Yes | Client + Server | Dataset name (e.g., "production") |
| `SANITY_API_READ_TOKEN` | No | Server only | Enables draft mode and unpublished content. App degrades gracefully without it. |
| `SANITY_REVALIDATE_SECRET` | No | Server only | Shared secret for webhook signature validation |

The `NEXT_PUBLIC_*` variables are required at build time — the app won't start without them. The server-only variables are optional: missing `SANITY_API_READ_TOKEN` logs a warning and disables draft mode; missing `SANITY_REVALIDATE_SECRET` returns a 500 from the webhook endpoint.

## Security Decisions

| Concern | Decision |
|---------|----------|
| **Read token exposure** | `browserToken` is set to `false` in `defineLive()`. The read token never reaches the client. Draft previewing only works inside the Presentation Tool. |
| **Webhook authentication** | Requests to `/api/sanity/revalidate` are validated against a signed secret using `next-sanity/webhook`'s `parseBody()`. |
| **XSS in rich text** | Links in Portable Text are sanitized at render time with `isSafeUrl()`. The schema also validates URL schemes at write time. |
| **XSS in social links** | Team member social URLs are validated with the same `isSafeUrl()` helper. |
| **Iframe embeds** | Video embed URLs are validated against an allowlist of hosts (YouTube, Vimeo) and rendered with `sandbox="allow-scripts allow-same-origin"`. |
| **Partner website links** | External URLs are validated with `isSafeUrl()` before rendering. |

## Testing

Sanity-related tests:

- `src/lib/sanity/env.test.ts` — Validates env var guards
- `src/lib/sanity/image.test.ts` — Tests `urlFor()` URL generation
- `src/lib/data/sanity.test.ts` — Tests data fetchers with mocked `sanityFetch`
- `src/lib/sanity/schemas/schemas.test.ts` — Validates schema definitions

The test setup (`src/test/setup.ts`) sets `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET` before any imports to prevent the module-level guards in `env.ts` from throwing.
