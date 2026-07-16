# Academy page: fully CMS-driven from Sanity — design spec

**Status:** approved design, pre-implementation · **Date:** 2026-07-16 · **Branch:** `feat/academy-cms-sanity`

## Goal

Make the public Academy listing page (`/academy`) fully editable by an admin from
Sanity — every piece of text and every image. Sanity is the **source of truth**:
if an admin clears a field, it disappears from the live site. No hardcoded copy,
no baked-in image fallbacks that can't be removed. Editing works via the Sanity
Studio **Presentation** click-to-edit overlays (and equally via Structure).

## Non-goals (explicitly out of scope)

- Adding / removing / reordering **whole programmes**. The four programmes
  (`photography`, `filmmaking`, `freediving`, `internship`) stay fixed in code
  because their slugs are wired into routing (`/academy/[program]`), the apply
  flow, admin, and the `applications` database rows.
- The programme **detail** pages (`/academy/[program]`) and **apply** pages —
  a later pass can follow the same recipe. (See "PROGRAM_MARKETING consumers"
  under Risks — if the detail page shares the static config we're deleting, that
  must be handled, see there.)
- The homepage draft-mode / visual-editing bridge gap (separate issue; owner does
  not want draft-mode workflow — see `project-sanity-visual-editing-home` memory).
- Any other marketing page (homepage, films, etc.).

## Confirmed decisions

1. **Content-only, fixed four.** Sanity owns all display text + images; code owns
   which programmes exist, their URLs, and the apply flow.
2. **Model = extend existing docs.** Per-programme content on the four existing
   `program` documents (shared with the detail pages — single source, no drift);
   page chrome on the existing `academyPageSettings` singleton.
3. **Removability = graceful degradation.** Every field optional; a cleared text
   field renders nothing, a cleared image renders nothing (no `/public` fallback).
4. **Seed at launch.** A one-time migration writes today's exact copy into Sanity
   and uploads the current shipped photos as the initial Sanity images, so the
   page is visually identical the moment this ships.
5. **Name handling.** The display `name` becomes Sanity-editable (clearable on the
   page). The URL **slug** and a code-side identity label stay fixed so the apply
   flow, admin, and DB never break or show blank.

## Current state (what we're replacing)

- **Static text** lives in `src/lib/academy/marketing.ts` (`PROGRAM_MARKETING`:
  overline, tag, description, highlights) and `src/lib/academy/programs.ts`
  (`PROGRAMS`: name, shortDescription, applicationOpen), plus hardcoded strings in
  the components (hero eyebrow/heading, CTA heading/body/button).
- **Images** come from Sanity `program.{panelImage,overviewImage,heroImage}` and
  `academyPageSettings.ctaImage` when set, otherwise fall back to shipped
  `/public/images/academy/*.jpg` (resolvers in `src/lib/academy/images.ts`).
- The academy page (`src/app/(marketing)/academy/page.tsx`) reads Sanity via the
  cached plain-client fetchers in `src/lib/data/sanity.ts` (`getAllProgramsCms`,
  `getAcademyPageSettings`) — **no stega**, so Presentation overlays don't light up.

## Design

### 1. Schema additions (all fields optional)

`src/lib/sanity/schemas/documents/program.ts` — add, grouped near the top for
editor UX, above the existing detail-page fields:

| field | type | current source |
|-------|------|----------------|
| `name` | string | `PROGRAMS[slug].name` |
| `tag` | string | `PROGRAM_MARKETING[slug].tag` |
| `overline` | string | `PROGRAM_MARKETING[slug].overline` |
| `description` | text (rows: 4) | `PROGRAM_MARKETING[slug].description` |

Already present and reused: `highlights` (array<string>), `panelImage`,
`overviewImage`, `heroImage`, `applicationOpen`.

`src/lib/sanity/schemas/documents/academyPageSettings.ts` — add:

| field | type | current source |
|-------|------|----------------|
| `heroEyebrow` | string | "Behind the Mask · Academy" |
| `heroHeading` | string | "Four ways to create beneath the surface" |
| `ctaHeading` | string | "Not sure which path is yours?" |
| `ctaBody` | text (rows: 3) | CTA paragraph |
| `ctaButtonLabel` | string | "Get in touch" |

Already present: `ctaImage`. The CTA button **href stays `/contact` in code**
(structural link target; only the label is editable).

After schema edits, regenerate types: `npm run typegen` (updates `sanity.types.ts`).

### 2. Data flow (stega-enabled, no fallbacks)

- **Already done:** `getAllProgramsCms` and `getAcademyPageSettings` in
  `src/lib/data/sanity.ts` already use `sanityFetch` (from `@/lib/sanity/live`),
  so responses are stega-encoded and Presentation overlays already work for these
  reads. No fetcher change is needed — the return types flow automatically from
  the generated `sanity.types.ts` after `typegen`.
- Extend the GROQ projections in `src/lib/sanity/queries.ts`:
  - `ALL_PROGRAMS_CMS_QUERY` → also project `name, tag, overline, description,
    highlights`.
  - `ACADEMY_PAGE_SETTINGS_QUERY` → also project `heroEyebrow, heroHeading,
    ctaHeading, ctaBody, ctaButtonLabel`.
- `src/app/(marketing)/academy/page.tsx`: read **only** from Sanity. Drop the
  `PROGRAM_MARKETING` import and the `fallbackImage`/`marketing.*` props. Keep
  `PROGRAMS` **only** for the structural identity (slug, `applicationOpen`
  default, apply/detail hrefs). Pass Sanity `name/tag/overline/description/
  highlights` and the raw Sanity images down to the components.
- `applicationOpen` remains Sanity-override-then-code-default (it is state, not
  removable content): `cms?.applicationOpen ?? PROGRAMS[slug].applicationOpen`.

### 3. Component changes (empty-state rendering)

`AcademyPanels.tsx`
- `heroEyebrow` / `heroHeading`: render each only if present.
- Each panel: `panelImage` only if present (else the tile shows the `#020306`
  base — the four tiles stay because programmes are fixed). Remove the
  `next/image` fallback branch and `fallbackImage` prop. `name` / `tag` render
  only if present. `Explore →` and slug link stay (structural).

`AcademyProgramSection.tsx`
- `overline` / `name` / `description`: render only if present.
- `highlights`: render the list only if non-empty.
- `overviewImage`: if present, keep the two-column photo/text layout; **if absent,
  collapse to a single full-width text column** (the grid drops the image cell).
  Remove the `next/image` fallback branch and `fallbackImage` prop.
- Apply / Learn-more buttons stay (structural, driven by `applicationOpen`).

`AcademyCTABand.tsx`
- `ctaHeading` / `ctaBody` / `ctaButtonLabel`: render only if present (if the
  label is empty, hide the button; the link target is always `/contact`).
- `ctaImage`: only if present; otherwise the band is the `#020306/80` wash alone.
  Remove the `next/image` fallback branch.

`src/lib/academy/images.ts` resolvers still return "the Sanity image or `null`";
callers now render nothing on `null` instead of substituting a local file.

### 4. One-time content migration (run BEFORE the code deploy)

A script (or a one-off Opus-agent Sanity-API task, mirroring the earlier program
stub seeding) that, against the **`production`** dataset (and **`development`** for
local-dev parity):

1. **Text** — patches each of the four `program` docs with the current
   `PROGRAM_MARKETING` + `PROGRAMS` copy (`name, tag, overline, description,
   highlights`), and patches `academyPageSettings` with the current hero + CTA
   strings.
2. **Images** — uploads the current `/public/images/academy/*.jpg` files as Sanity
   image assets and sets `panelImage` + `overviewImage` on each program doc and
   `ctaImage` on `academyPageSettings`. (Panel = portrait `*.jpg`; overview =
   `*-wide.jpg`; CTA = `cta-wide.jpg`.)

Idempotent (use deterministic asset handling / `createOrReplace`-style patches).
Verify counts + field presence via the API afterward.

### 5. Cleanup (scoped — most deletions DEFERRED)

Resolved by the consumer audit: **do NOT delete `src/lib/academy/marketing.ts`
or the `/public/images/academy/*.jpg` files in this pass.** The detail page
(`src/app/(marketing)/academy/[program]/page.tsx`) still imports
`PROGRAM_MARKETING` (line 47) and the image resolvers, so both are load-bearing.
Their removal is deferred to the detail-page follow-up.

In this pass, only the **listing** page stops importing `PROGRAM_MARKETING`; it
keeps `PROGRAMS` for slug/`applicationOpen`/identity. The three listing-only
components (`AcademyPanels`, `AcademyProgramSection`, `AcademyCTABand`) are used
by no other page, so their prop changes are safe.

## Error handling (fail loud, never fake)

- No silent fallback to local files: a missing image is an intentional empty
  state, not an error to paper over.
- If the Sanity fetch itself **fails** (network/token), that is a real error — let
  it surface (the fetchers already throw); do not swap in static content.
- Empty content is valid and renders as "absent"; a thrown fetch is a 500, per the
  project's error philosophy.

## Testing

- **Unit:** update `src/lib/sanity/queries.test.ts` (new projections),
  `schemas.test.ts` (new fields), `AcademyProgramSection.test.tsx`
  (image-less layout + omitted text), and the academy `page.test.tsx`
  (renders from a Sanity mock; missing fields → elements omitted, no crash).
- **E2E:** extend `e2e/sanity-pages.spec.ts` for `/academy` still rendering.
- **Manual:** in Studio Presentation on `/academy`, confirm every text + image is
  click-editable and that clearing a field removes it from the page; confirm the
  live production page is visually identical immediately after the seed.

## Rollout order

1. Land schema + query + page + component changes on `feat/academy-cms-sanity`;
   `npm run typegen`; run unit tests + build locally.
2. Run the migration against production (and development) Sanity — text + image
   uploads — and verify. **This must precede the code deploy** so the
   fallback-free page has content the instant it goes live.
3. Deploy to Hostinger. Page looks unchanged; admin can now edit/clear everything.
4. Verify in Presentation + on the live page, then do the `/public` image cleanup.

## Risks / open checks

- **`PROGRAM_MARKETING` consumers — RESOLVED.** Audit found the detail page
  (`/academy/[program]/page.tsx:47`) also imports `PROGRAM_MARKETING`, and the
  detail/apply/success/profile pages use `PROGRAMS`/`getProgram` for structural
  identity. Decision: keep `marketing.ts` and the `/public` images; migrate only
  the **listing** page now. The detail page stays static until its own follow-up
  pass — an accepted, explicit half-and-half for one release (listing = CMS,
  detail = static). Flag to owner.
- **Dataset split.** The live site reads `production`; local dev reads
  `development` (see `project-sanity-datasets` memory). Seed both; the repo's
  `.env.production` misreports the dataset — trust the datasets, not the file.
- **`sanityFetch` in cached fetchers.** Confirm `sanityFetch` composes with the
  existing `src/lib/data/sanity.ts` caching (it manages its own draft/stega +
  revalidation); adjust if it conflicts with the React `cache()` wrappers.
- **Layout when an image is cleared.** The image-less deep-dive collapses to
  full-width text — verify it still reads well; the hero tile without a photo is a
  dark panel by design.
