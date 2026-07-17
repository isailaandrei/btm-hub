# Films page: fully CMS-driven from Sanity — design spec

**Status:** design, pre-implementation · **Date:** 2026-07-17 · **Base:** `main` @ `e2fdd45` (all academy CMS work merged) · **Suggested branch:** `feat/films-cms-sanity`

This replicates the just-shipped Academy recipe (`docs/plans/academy-cms-driven-design.md`,
commits `f02ffdf` → `9cf6e09` → `e2fdd45`) on the `/films` marketing page. Read that spec
and those three commits first — every idiom below (empty-state rendering, `editAttr`
click-to-edit, seed-before-deploy) was established there.

## Goal

Make `/films` (and, minimally, `/films/[slug]` — see scope) fully editable from Sanity:

- Sanity is the **source of truth** for all on-page display text + images. A cleared
  field renders **nothing** — no static fallbacks, no baked-in copy that can't be removed.
- **Click-to-edit images** work in Studio Presentation: clicking a photo opens that
  image's field.
- Structural identity coupled to routing/behaviour stays in code.

Films is a much smaller job than Academy: the per-film content (title, tagline,
description, credits, metadata, poster, backdrop, video) **already lives in Sanity**
and is already fetched through the stega-enabled `sanityFetch` (so text is already
click-to-edit in Presentation). What remains static is (a) the page chrome strings
hardcoded in components, (b) the built-in row titles, and (c) image click-to-edit
wiring, which does not exist yet on this page.

## Non-goals (explicitly out of scope)

- **Functional UI microcopy stays in code** — same calibration the shipped Academy
  pages settled on (Academy kept "Explore", "Now enrolling", "What you'll get",
  section headings, "Applications closed" in code). Concretely, these strings do NOT
  move to Sanity:
  - search placeholder `"Search title, subject, location..."` and the sr-only
    `"Search films"` label (`FilmsBrowser.tsx:92,96`)
  - the whole filter sheet: `"Filters"`, `"Filter films"`, `"Refine the catalog…"`,
    facet labels, `"No … filters yet."`, `"Clear filters"` (`FilmFilterSheet.tsx`)
  - search-result strings: `"Matching Films"` row title (`FilmsBrowser.tsx:59`),
    `"No films match your search"`, `"Adjust the search or filters…"`,
    `"Reset search and filters"` (`FilmsBrowser.tsx:117-133`)
  - status badge labels `"In Production"` / `"Coming Soon"`
    (`FilmPlaybackModal.tsx:111-116`) — rendered from the `status` enum
  - fail-loud diagnostics: `"Video unavailable. Check the film embed URL in
    Sanity."` (modal + detail page), `"Untitled film"` guards (title is
    schema-required; the guard covers a broken draft, per fail-loud)
  - the sr-only `<h1>Films</h1>` (`FilmsBrowser.tsx:67`) — a11y landmark
  - `metadata` in `page.tsx` — Academy kept page `metadata` static; same here
  - the flourish ornament (`/images/home/flourish.svg`) — shared brand ornament,
    kept in code exactly as Academy did
- **No redesign of `/films/[slug]`.** It still uses the old light `bg-muted` theme,
  visually out of step with the cinematic listing. That is a design task, not a CMS
  task — flag it, don't fix it here.
- **No changes to the poster/backdrop image chain.** The resolution order
  (uploaded `backdrop` → uploaded `poster` → auto video thumbnail) stays. The auto
  video thumbnail is not a "static fallback" — it derives from the film's own
  Sanity-managed `videoEmbed` and remains removable by editing the film.
- No changes to filtering/search/rows *logic*, the playback modal behaviour, the
  homepage `VideosSection`, nav labels, or any other page.

## Current state — every text/image on the films pages

### `/films` listing

| # | On-page item | Current copy / source | Where | Static? |
|---|--------------|----------------------|-------|---------|
| T1 | Page metadata | "Films - Behind The Mask" / "Explore our underwater film portfolio." | `src/app/(marketing)/films/page.tsx:14-17` | static — **stays** (non-goal) |
| T2 | Empty-catalogue state | "Films" + "Our film portfolio is coming soon. Check back later." | `page.tsx:36-41` | static — **decision 3** |
| T3 | sr-only h1 "Films" | code | `src/components/films/FilmsBrowser.tsx:67` | static — stays |
| T4 | Hero eyebrow | "Featured film" | `src/components/films/FilmsHero.tsx:67-69` | static — **moves** |
| T5 | Hero title / tagline / year·duration | featured film's `title`/`tagline`/`releaseYear`/`duration` | `FilmsHero.tsx:33-34,72-82` | already Sanity (`film` doc) |
| T6 | Hero CTA "Watch film" | code | `FilmsHero.tsx:90` | static — **moves** (w/ code default) |
| T7 | Hero CTA "More details" | code | `FilmsHero.tsx:98` | static — **moves** (w/ code default, shared with T15) |
| T8 | Catalogue heading | "All films" | `FilmsBrowser.tsx:80-82` | static — **moves** |
| T9 | Catalogue description | "Browse the full catalogue — search or filter by location, subject, format, and skill." | `FilmsBrowser.tsx:83-86` | static — **moves** |
| T10 | Built-in row titles | "Featured" / "Latest" / "All Films" | `src/lib/films/rows.ts:59,61,64` | static — **move** |
| T11 | Curated row title/description | `filmCollection.title` / `.description` | `rows.ts:40-51` | already Sanity |
| T12 | Card title / meta / tagline / tags | `film` doc fields | `src/components/films/FilmCard.tsx:73-103` | already Sanity |
| T13 | Search/filter microcopy | see non-goals | `FilmsBrowser.tsx`, `FilmFilterSheet.tsx` | static — stays |
| T14 | Modal title / tagline / meta / tags | `film` doc fields | `src/components/films/FilmPlaybackModal.tsx:93-131` | already Sanity |
| T15 | Modal "More details" button | code | `FilmPlaybackModal.tsx:136` | static — **moves** (same field as T7) |
| I1 | Hero backdrop | `film.backdrop` → `film.poster` → auto video thumbnail | chain in `src/lib/films/posters.ts:60-71` (`filmHeroBackdropUrl`), rendered `FilmsHero.tsx:45-54` | Sanity image, but **no click-to-edit**; scrims at `FilmsHero.tsx:60-62` block clicks |
| I2 | Card posters | `film.poster` → auto video thumbnail | `posters.ts:145-173` (`withFilmPosterUrls`), rendered `src/components/films/FilmPoster.tsx:33-42` | Sanity image, **no click-to-edit** |
| I3 | Card no-poster fallback | gradient + film title | `FilmPoster.tsx:20-31` | code — stays (disclosed degraded state, not fake content) |
| I4 | Hero no-image fallback | gradient div | `FilmsHero.tsx:56` | code — stays (same rationale) |
| I5 | Flourish ornament | `/images/home/flourish.svg` | `FilmsHero.tsx:10,71` | code — stays |

### `/films/[slug]` detail

| # | On-page item | Source | Where | Static? |
|---|--------------|--------|-------|---------|
| D1 | metadata (title/description) | film `title`/`tagline` | `src/app/(marketing)/films/[slug]/page.tsx:15-27` | already Sanity |
| D2 | Video embed + error copy | `film.videoEmbed`; error strings in code | `[slug]/page.tsx:44-59` | error copy stays (fail-loud) |
| D3 | Title / tagline / year / duration | film doc | `[slug]/page.tsx:63-70` | already Sanity |
| D4 | "About" heading + description | heading code; body `film.description` (portable text) | `[slug]/page.tsx:76-93` | heading stays (academy precedent); **placeholder must go** |
| D5 | "No about copy configured in Sanity." | code | `[slug]/page.tsx:88-92` | **remove** — violates cleared-renders-nothing |
| D6 | "Credits" heading + credit list | heading code; list `film.credits` | `[slug]/page.tsx:95-184` | heading stays; **placeholder must go** |
| D7 | "No credits configured in Sanity." | code | `[slug]/page.tsx:179-183` | **remove** — same |
| D8 | "Back to Films" link | code | `[slug]/page.tsx:186-191` | stays (structural nav) |

There are **no images** on the detail page (only the video iframe) — no click-to-edit
wiring needed there. All detail text already flows through `getFilmBySlug` →
`sanityFetch` (stega), so it is already text-editable in Presentation.

## Design

### 1. Schema additions — `src/lib/sanity/schemas/documents/filmsPageSettings.ts`

All fields optional (no `validation.required()`). Add **after** the two existing
boolean toggles, in this order (editor reading order: hero → catalogue → rows):

| field | type | title | description |
|-------|------|-------|-------------|
| `heroEyebrow` | `string` | `Hero Eyebrow` | `Small caption above the featured film's title (e.g. "Featured film"). Cleared = hidden.` |
| `watchButtonLabel` | `string` | `Watch Button Label` | `Label of the hero's play button. Defaults to "Watch film" if empty (the button itself always shows — it is the page's primary action).` |
| `detailsButtonLabel` | `string` | `Details Button Label` | `Label of the "More details" links in the hero and the playback modal. Defaults to "More details" if empty.` |
| `catalogueHeading` | `string` | `Catalogue Heading` | `Heading above the searchable catalogue (e.g. "All films"). Cleared = hidden.` |
| `catalogueDescription` | `text` (rows: 2) | `Catalogue Description` | `Short blurb under the catalogue heading. Cleared = hidden.` |
| `featuredRowTitle` | `string` | `Featured Row Title` | `Title of the automatic row of featured films. Cleared = the row shows with no heading.` |
| `latestRowTitle` | `string` | `Latest Row Title` | `Title of the automatic Latest row. Cleared = the row shows with no heading (use "Show Latest Row" to hide the row itself).` |
| `allFilmsRowTitle` | `string` | `All Films Row Title` | `Title of the automatic row containing every film. Cleared = the row shows with no heading (use "Show All Videos Row" to hide the row itself).` |

No new fields on `film` / `filmCollection` — their display content is already modelled.
No Studio structure change needed: the singleton is already wired in
`sanity.config.ts:31-39` and excluded from create-templates at `sanity.config.ts:78-84`.

After the schema edit: `npm run typegen` (regenerates `sanity.types.ts`; the new
optional fields flow into `FILMS_PAGE_SETTINGS_QUERY_RESULT` automatically once the
query below is widened).

### 2. GROQ — `src/lib/sanity/queries.ts`

`FILMS_PAGE_SETTINGS_QUERY` (lines 78-83) — add the eight new fields as plain
projections alongside the two coalesced booleans (do NOT coalesce the strings; null
must reach the page so cleared fields render nothing):

```groq
*[_type == "filmsPageSettings" && _id == "filmsPageSettings"][0] {
  "showLatestRow": coalesce(showLatestRow, true),
  "showAllVideosRow": coalesce(showAllVideosRow, true),
  heroEyebrow,
  watchButtonLabel,
  detailsButtonLabel,
  catalogueHeading,
  catalogueDescription,
  featuredRowTitle,
  latestRowTitle,
  allFilmsRowTitle
}
```

No other query changes. `FILMS_QUERY` already projects `_id`, `poster`, `backdrop`
(needed for `editAttr`); `FILM_COLLECTIONS_QUERY` reuses `FILM_CARD_FIELDS` which
includes `_id` + `poster`. Strings need no `_id` for editing — stega handles them.

Then `npm run typegen` again (once, after both schema + query edits, is fine).

### 3. Data layer — no changes

`getFilms` / `getFilmCollections` / `getFilmsPageSettings` / `getFilmBySlug` in
`src/lib/data/sanity.ts:54-80` already use `sanityFetch` (stega-enabled) wrapped in
`cache()`. Confirmed — nothing to do. (`getAllFilmSlugs` deliberately uses the plain
client for `generateStaticParams`; leave it.)

### 4. Poster helpers — `src/lib/films/posters.ts`

Two changes, both to support image click-to-edit:

**(a) Hero backdrop: expose which field resolved.** The hero URL comes from a
priority chain, so the edit attribute must target the field that actually rendered.
Change `filmHeroBackdropUrl` (lines 60-71) into:

```ts
export type FilmHeroBackdrop = {
  url: string | null;
  /** Which source resolved: the Sanity field to open on click, or the non-editable auto thumbnail. */
  source: "backdrop" | "poster" | "video-thumbnail" | null;
};

export function filmHeroBackdrop(
  film: FilmHeroImageSource | null | undefined,
  width: number,
  height: number,
): FilmHeroBackdrop {
  const backdrop = uploadedPosterImageUrl(film?.backdrop, width, height);
  if (backdrop) return { url: backdrop, source: "backdrop" };
  const poster = uploadedPosterImageUrl(film?.poster, width, height);
  if (poster) return { url: poster, source: "poster" };
  if (film?.posterUrl) return { url: film.posterUrl, source: "video-thumbnail" };
  return { url: null, source: null };
}
```

Replace `filmHeroBackdropUrl` outright (its only consumers are
`src/app/(marketing)/films/page.tsx:9,50` and `posters.test.ts`) — keep the
priority-chain doc comment.

**(b) Card posters: attach the edit attribute during enrichment.** In
`withFilmPosterUrls` (lines 145-173), when the uploaded poster wins, also set
`posterEditAttr`:

```ts
import { editAttr } from "../sanity/data-attribute";
// …
const uploaded = uploadedPosterImageUrl(film.poster, 1200, 675);
if (uploaded) {
  return {
    ...film,
    posterUrl: uploaded,
    posterEditAttr: editAttr(film._id, "film", "poster"),
  };
}
// thumbnail path: return { ...film, posterUrl: await posterUrlPromise } (no posterEditAttr)
```

Widen the return type `FilmWithPoster<TFilm>` to `TFilm & { posterUrl: string | null;
posterEditAttr?: string }`. In `withCollectionFilmPosterUrls` (lines 175-187), copy
`posterEditAttr` by film id exactly as `posterUrl` is copied today (build the map(s)
in `page.tsx`, see §5). `editAttr` (from `src/lib/sanity/data-attribute.ts`) returns
a plain string — serialisable to the client components. These helpers run
server-side only (imported solely by `films/page.tsx`), so the `env.ts` import chain
is safe.

### 5. Types — `src/lib/films/types.ts`

- `FilmBrowserFilm`: add `posterEditAttr?: string | null;`
- `FilmRow`: change `title: string` → `title: string | null;`
- Add:

```ts
export type FilmRowTitles = {
  featuredRowTitle?: string | null;
  latestRowTitle?: string | null;
  allFilmsRowTitle?: string | null;
};
```

### 6. Rows — `src/lib/films/rows.ts`

`buildFilmRows` gains a fourth optional param `titles?: FilmRowTitles`. The three
built-in rows use it with **no code default string**:

```ts
...(featured.length > 0
  ? [{ id: "featured", title: titles?.featuredRowTitle ?? null, films: featured }]
  : []),
...(rowVisibility.showLatestRow && latest.length > 0
  ? [{ id: "latest", title: titles?.latestRowTitle ?? null, films: latest }]
  : []),
...(rowVisibility.showAllVideosRow && all.length > 0
  ? [{ id: "all", title: titles?.allFilmsRowTitle ?? null, films: all }]
  : []),
```

Cleared title ⇒ the row still renders (row *presence* is governed by the explicit
visibility toggles / featured flags), just without a heading — see FilmRow below.
Curated collection rows keep today's behaviour unchanged (their `title` is
schema-required; the `hasTitle` guard at `rows.ts:29-31,41` stays).

### 7. Page — `src/app/(marketing)/films/page.tsx`

- Import `filmHeroBackdrop` (replacing `filmHeroBackdropUrl`) and `editAttr` from
  `@/lib/sanity/data-attribute`.
- After `withFilmPosterUrls`, build both maps for the collection copy step:
  `posterUrlsByFilmId` (exists) plus `posterEditAttrsByFilmId` — or change
  `withCollectionFilmPosterUrls` to take the enriched films array and derive both
  internally (implementer's choice; keep it in `posters.ts`).
- Hero resolution becomes:

```ts
const hero = filmHeroBackdrop(featuredFilm, 2400, 1350);
const heroEditAttr =
  hero.source === "backdrop"
    ? editAttr(featuredFilm._id, "film", "backdrop")
    : hero.source === "poster"
      ? editAttr(featuredFilm._id, "film", "poster")
      : undefined; // auto video thumbnail — not a Sanity asset, nothing to open
```

- Pass to `FilmsBrowser`: `heroImageUrl={hero.url}`, `heroEditAttr={heroEditAttr}`,
  and `settings={settings}` (or individual chrome props, see §8; pick ONE shape and
  thread it consistently).
- T2 (empty-catalogue block, lines 34-43): unchanged in this pass unless the owner
  picks otherwise in Decision 3.

### 8. Components — empty-state rule per field + click-to-edit wiring

`src/components/films/FilmsBrowser.tsx` — new props:
`heroEditAttr?: string`, plus the chrome strings
(`heroEyebrow`, `watchButtonLabel`, `detailsButtonLabel`, `catalogueHeading`,
`catalogueDescription`, `rowTitles: FilmRowTitles` — all `string | null |
undefined` except `rowTitles`).

- Pass `rowTitles` as the 4th arg of `buildFilmRows` (line 61). The synthetic
  search row keeps its static `"Matching Films"` title (non-goal).
- Catalogue header (lines 78-87): keep the outer flex wrapper and the left `<div>`
  **always rendered** (so `justify-between` keeps the search/filter controls
  right-aligned when the copy is cleared); inside it render the `<h2>` only when
  `catalogueHeading` is non-empty and the `<p>` only when `catalogueDescription`
  is non-empty.
- Forward `heroEyebrow` / `watchButtonLabel` / `detailsButtonLabel` /
  `heroEditAttr` to `FilmsHero`; forward `detailsButtonLabel` to
  `FilmPlaybackModal`.

`src/components/films/FilmsHero.tsx`

- New props: `eyebrow?: string | null`, `watchLabel?: string | null`,
  `detailsLabel?: string | null`, `editAttr?: string` (name it `dataSanity` to
  match `SanityImage`'s prop naming).
- Eyebrow `<p>` (lines 67-69): render only when `eyebrow` is non-empty. **Cleared ⇒
  element omitted** (flourish + title block move up naturally; no layout change
  needed — the column is a simple stack).
- Watch button (line 90): label = `watchLabel || "Watch film"` (code default — the
  button is the page's primary structural action and must never render blank; same
  pattern as Academy's `applyButtonLabel || "Apply"` at
  `src/app/(marketing)/academy/[program]/page.tsx:55`).
- Details link (line 98): label = `detailsLabel || "More details"` (same rationale;
  the link only renders when the film has a slug, as today).
- Backdrop `<Image>` (lines 46-54): add `data-sanity={dataSanity}` (plain
  `next/image` forwards `data-*` attributes; see `SanityImage.tsx` for precedent).
- **Scrims:** add `pointer-events-none` to all three scrim divs at lines 60-62
  (`bg-black/30`, the bottom dissolve gradient, the left wash). Without this the
  Presentation click never reaches the image — the exact fix the academy panels
  needed (`AcademyPanels.tsx:86-90`).
- The no-image gradient fallback (line 56) stays as-is (I4).

`src/components/films/FilmCard.tsx`

- Add `data-sanity={film.posterEditAttr ?? undefined}` to the **full-card play
  `<button>`** (lines 58-63, the `absolute inset-0 z-10` element) — NOT to the
  poster image. The button is the topmost hit-target covering the card, so
  Presentation's hover/click detection lands on it; putting the attribute on the
  underlying image would require making the button click-transparent, which would
  break playback. The attribute is inert outside the Studio iframe
  (`data-attribute.ts:8-11`), so production behaviour is unchanged. Cards whose
  poster is an auto video thumbnail get no attribute (nothing to edit). The z-20
  hover-content overlay already has `pointer-events-none` (line 70) — leave it.

`src/components/films/FilmPoster.tsx` — no changes (the edit attribute lives on the
card's button; the poster keeps rendering by resolved URL).

`src/components/films/FilmPlaybackModal.tsx`

- New prop `detailsLabel?: string | null`; button text (line 136) =
  `detailsLabel || "More details"` (same shared field + default as the hero).

`src/components/films/FilmRow.tsx`

- `row.title` is now nullable. When null/empty: omit the whole heading block
  (`<h2>` and description `<p>`), drop `aria-labelledby` from the `<section>`
  (a nameless section is valid; do not invent an aria-label string), and make the
  scroll-button sr-only texts title-agnostic: `Scroll left` / `Scroll right`
  (drop the `{row.title}` interpolation at lines 59, 71 — simpler than
  conditionalising it, and stega-encoded titles don't belong in sr-only text
  anyway).
- Note the outer `-heading` id (line 30) is only referenced by `aria-labelledby`;
  keep the id on the `<h2>` when it renders.

`src/app/(marketing)/films/[slug]/page.tsx` (if Decision 1 = include; recommended)

- **About section** (lines 76-93): render the entire `<section>` (heading included)
  only when `film.description` is set. Delete the `"No about copy configured in
  Sanity."` placeholder (D5) — cleared field renders nothing.
- **Credits section** (lines 95-184): render the entire `<section>` only when
  `film.credits` is non-empty. Delete the `"No credits configured in Sanity."`
  placeholder (D7).
- Keep the `"About"` / `"Credits"` headings themselves in code (academy precedent:
  detail-page section headings like "Curriculum" stayed static), the video-error
  copy (fail-loud), and the back-link.

### 9. One-time content migration (run BEFORE the code deploy)

**`scripts/seed-films-content.ts`** (scripts/ is gitignored; model it on
`scripts/seed-academy-content.ts` and `seed-academy-detail.ts` — same CLI shape,
same client setup: `PROJECT_ID = "m8zkcvq4"`, `API_VERSION = "2025-03-20"`,
`SANITY_WRITE_TOKEN` env, dataset as argv[2], `createClient({ useCdn: false })`).

This seed is **text-only** — much smaller than academy's. All film images already
live in Sanity (`film.poster` / `film.backdrop`) or derive from the film's video;
**no asset uploads and no film-document patches are needed**. The page renders
identically before/after because the image chain is untouched.

Steps per dataset:

1. `client.createIfNotExists({ _id: "filmsPageSettings", _type: "filmsPageSettings" })`
2. `client.patch("filmsPageSettings").set({...}).commit()` with the current
   shipped copy, transcribed verbatim from the pre-change components:

```ts
const PAGE_SETTINGS = {
  heroEyebrow: "Featured film",                    // FilmsHero.tsx:68
  watchButtonLabel: "Watch film",                  // FilmsHero.tsx:90
  detailsButtonLabel: "More details",              // FilmsHero.tsx:98 + FilmPlaybackModal.tsx:136
  catalogueHeading: "All films",                   // FilmsBrowser.tsx:81
  catalogueDescription:
    "Browse the full catalogue — search or filter by location, subject, format, and skill.", // FilmsBrowser.tsx:84-85 (em-dash preserved)
  featuredRowTitle: "Featured",                    // rows.ts:59
  latestRowTitle: "Latest",                        // rows.ts:61
  allFilmsRowTitle: "All Films",                   // rows.ts:64
} as const;
```

3. Verify: GROQ-fetch the singleton back and assert all eight fields are non-empty;
   print the doc. Idempotent (`.set` overwrites; safe to re-run).

Run against **both datasets** — the deployed site reads **`production`**, local dev
reads **`development`**. Do NOT trust `.env.production`'s dataset value (known to
misreport — see the `project-sanity-datasets` memory):

```
SANITY_WRITE_TOKEN=<token> npx tsx scripts/seed-films-content.ts development
SANITY_WRITE_TOKEN=<token> npx tsx scripts/seed-films-content.ts production
```

**Ordering is a hard gate:** production seed **must complete before the code
deploy** — the new code drops the hardcoded chrome, so an unseeded dataset would
ship a films page with no hero eyebrow, no catalogue heading, and heading-less rows.

### 10. Cleanup — audit result: nothing to delete

Audited for a films equivalent of `src/lib/academy/marketing.ts`: there is none.
`src/lib/films/` contains only functional modules — `embed.ts` (URL parsing),
`filtering.ts`, `rows.ts`, `credits.ts`, `posters.ts`, `types.ts` — all with live
consumers on the listing and/or detail page. The static copy being migrated lives
inline in the components and is removed by the §8 edits. No file deletions in this
pass. (`filmHeroBackdropUrl` is removed as a function, replaced by
`filmHeroBackdrop` — grep confirms its only consumers are `films/page.tsx` and
`posters.test.ts`.)

## Error handling (fail loud, never fake)

Same contract as academy (`academy-cms-driven-design.md` §Error handling): empty
content is a valid "absent" state and renders nothing; a **failed** Sanity fetch
throws and surfaces (the fetchers already throw) — never substitute static copy.
The two disclosed degraded states that remain (I3 gradient-with-title for a film
whose thumbnail can't resolve; video-unavailable messages) are diagnostics, kept.

## Testing + verification gates

While iterating: `npx tsc --noEmit` + `npm run lint` + affected test files
(`vitest run <path>`). Before handing back: full `npm run test:unit` and
`npm run build` must pass.

Test files to update:

- `src/lib/sanity/schemas/schemas.test.ts` — the `filmsPageSettings` test at
  ~line 197 asserts the **exact** field list `["showLatestRow", "showAllVideosRow"]`
  with `toEqual`; extend it to the new ten-field list + types, mirroring the
  academy settings test just below it.
- `src/lib/sanity/queries.test.ts` — add a `FILMS_PAGE_SETTINGS_QUERY` block
  asserting the eight new projections (mirror the academy settings block).
- `src/lib/films/rows.test.ts` — existing assertions use the hardcoded titles
  ("Featured", "Latest", "All Films"); update to pass a `titles` param where a
  title is asserted, and add: no titles passed ⇒ built-in rows have `title: null`
  but still appear (ids `featured`/`latest`/`all`).
- `src/lib/films/posters.test.ts` — port the `filmHeroBackdropUrl` describe block
  (lines 135-169) to `filmHeroBackdrop` (assert `url` AND `source` for all four
  chain outcomes); add `withFilmPosterUrls` assertions: uploaded poster ⇒
  `posterEditAttr` defined; thumbnail path ⇒ `posterEditAttr` undefined.
- `src/app/(marketing)/films/page.test.tsx` — update the `@/lib/films/posters`
  mock (new function name/shape: `filmHeroBackdrop` returning `{ url, source }`)
  and the `getFilmsPageSettings` mock (add the new fields).
- **New** `src/components/films/FilmsHero.test.tsx` (renderToStaticMarkup, like
  `films/page.test.tsx`): eyebrow renders when set / absent when null; watch +
  details labels use Sanity values and fall back to "Watch film"/"More details";
  `data-sanity` lands on the backdrop `<img>`; all three scrim divs carry
  `pointer-events-none`.
- **New** `src/app/(marketing)/films/[slug]/page.test.tsx` (mock
  `@/lib/data/sanity`'s `getFilmBySlug`, catch the notFound pattern per CLAUDE.md):
  film with description+credits renders "About" and "Credits"; film with neither
  renders neither heading and contains no "configured in Sanity" text.
- `e2e/sanity-pages.spec.ts` — no changes expected: the strings it relies on
  (sr-only "Films" h1, "Search films" label, "no films match your search") all
  stay in code. Verify it still passes if E2E is run.

Manual verification (after seed + deploy to a dev environment):

- `npm run dev`, open `/studio` → Presentation → `/films`: every moved string is
  click-editable; clicking the hero backdrop opens the featured film's
  `backdrop` (or `poster`) field; clicking a card with an uploaded poster opens
  its `poster` field; clearing `heroEyebrow` / `catalogueHeading` /
  `latestRowTitle` removes the element (rows stay, heading-less).
- `/films` in a normal tab renders pixel-identical to pre-change after the seed.

## Rollout order

1. Land schema + query + lib + component changes on `feat/films-cms-sanity`;
   `npm run typegen`; unit tests + build green. Commit locally — **do not push**
   without approval (repo rule).
2. Write + run the seed against `development`; verify locally (page identical,
   Presentation editing works end-to-end).
3. Run the seed against `production`; verify via GROQ.
4. Deploy (Hostinger — MCP `hosting_deployJsApplication` or the TUS script, per
   the migration runbook). Verify live page + Presentation.

## Decisions for owner

1. **Detail-page scope.** Recommended: include `/films/[slug]` in this pass, but
   only the minimal empty-state fix (omit the About/Credits sections when their
   Sanity field is empty, deleting the public "No … configured in Sanity."
   placeholders). It's already fully Sanity-driven otherwise; the alternative —
   deferring — leaves editor-facing diagnostic text on the public site, which
   directly contradicts the cleared-field-renders-nothing rule. (Its visual
   redesign to the cinematic style stays out of scope either way.)
2. **Microcopy boundary.** Functional UI strings stay in code (search placeholder,
   filter sheet, no-match/reset strings, "Matching Films", status badges,
   video-error text), and the two structural CTA labels get code defaults
   ("Watch film" / "More details") so the buttons can never render blank — the
   same calibration the shipped academy pages use (`applyButtonLabel || "Apply"`).
   Confirm this matches your intent for films.
3. **Empty-catalogue copy** ("Our film portfolio is coming soon. Check back
   later." — shows only when Sanity has zero films). Recommended: keep in code as
   a diagnostic edge state. Alternative: two more singleton fields
   (`emptyStateHeading`/`emptyStateBody`) if you want it editable.

## Risks / open checks

- **Seed-before-deploy is load-bearing** (§9): deploying unseeded production blanks
  the hero eyebrow, catalogue heading, and all built-in row headings. Gate the
  deploy on the GROQ verification step.
- **Card click-to-edit placement.** The `data-sanity` attribute rides the full-card
  play button, so in Presentation the editable hover region is the whole card (not
  just the visible photo pixels) and clicking opens the poster field instead of
  playing. That is the intended Presentation behaviour; confirm it feels right in
  Studio during manual verification. If Presentation's overlay turns out to work
  through the button without the attribute (i.e. detection is overlay-based, not
  pointer-events-based), simplify to putting the attribute on the poster `<Image>`
  — decide by testing in Studio, keep whichever works.
- **Stega + client-side search/filtering.** Film strings are already
  stega-encoded today (the page already uses `sanityFetch`) and search/filter
  operate on them unchanged — this plan adds no new interaction, but any
  weirdness observed in search matching predates this work; don't chase it here.
- **`FilmRowVisibilitySettings` shape.** Row *titles* deliberately ride a separate
  `FilmRowTitles` param rather than being folded into the visibility type, to keep
  the `rowVisibility` prop/test surface stable. If the implementer finds threading
  two props noisier than one combined `rowSettings`, combining is acceptable —
  but update every consumer listed in §Current state consistently.
- **Draft-mode preview** uses `/api/draft-mode/enable` (`sanity.config.ts:68-74`),
  already proven by the academy work — no new wiring expected; verify Presentation
  loads `/films` before assuming a films-specific problem.
