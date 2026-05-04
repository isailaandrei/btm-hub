# Films Browsing Design

Date: 2026-05-04
Branch: `feature/films-video-library`

## Context

The current films experience is Sanity-driven. `/films` fetches Sanity film documents and links each card to `/films/[slug]`. Individual film pages render the film hero, description, credits, gallery, and a YouTube/Vimeo iframe when `videoEmbed` passes the allowlist.

For this phase, videos will continue to play through YouTube or Vimeo iframe embeds. We will not upload video files to Supabase, the Next.js server, or the hosting filesystem. Sanity remains the source of truth for public film metadata.

Docs checked during design:

- Next.js `serverActions.bodySizeLimit`: large video upload through Server Actions is not appropriate for this direction.
- Supabase Storage resumable uploads and CDN docs: useful later if BTM hosts files directly, but out of scope now.
- Sanity schema docs for arrays, references, and field groups: supports the metadata and curated collection shape.
- MDN `<video>` docs: relevant only if the project later hosts native video files instead of iframe embeds.

## Chosen Approach

Use a Sanity-only catalog with client-side browsing.

Sanity stores all films, categorized metadata, curated rows, poster imagery, and embed URLs. Next.js fetches the full published catalog on the server, then a focused client component handles search, filter drawer state, horizontal row browsing, hover expansion, and modal state.

This is the right fit because the public film catalog is expected to be moderate in size, the UX should feel smooth and cinematic, and no authenticated or per-user video access is required.

## Data Model

Extend the existing Sanity `film` document.

Fields to keep:

- `title`
- `slug`
- `tagline`
- `description`
- `heroImage`
- `videoEmbed`
- `gallery`
- `credits`
- `releaseYear`
- `duration`
- `status`
- `featured`
- `sortOrder`

Fields to add:

- `thumbnailImage`: optional card poster image. Falls back to `heroImage`.
- `locations`: categorized metadata values such as `Azores`, `Indonesia`, or `Red Sea`.
- `subjects`: categorized metadata values such as `whales`, `sharks`, `conservation`, or `freediving`.
- `formats`: categorized metadata values such as `documentary`, `tutorial`, `behind-the-scenes`, or `short film`.
- `skills`: categorized metadata values such as `filming`, `editing`, `breath-hold`, or `lighting`.
- `displayTags`: optional editorial chips shown on cards and in the modal.

Use Sanity field groups to keep content entry manageable, for example `Content`, `Media`, `Playback`, and `Metadata`.

Add a new Sanity document type, `filmCollection`, for curated rows:

- `title`
- `slug`
- `description` optional
- `films`: ordered references to `film`
- `sortOrder`
- `enabled`

The app also generates automatic fallback rows from the films list:

- Featured
- Latest
- All Films

## Page Experience

`/films` becomes the primary browsing surface.

The page includes:

- Cinematic header for Films.
- Search input near the top.
- Filters button that opens a Sheet-style drawer.
- Active filter chips beside or below the filters button.
- Netflix-style horizontal rows.
- Curated Sanity collections first.
- Automatic fallback rows after curated collections.
- Film cards with poster image, title, duration/year, and display tags.
- Hover/focus expansion on desktop showing richer metadata and play/detail affordance.
- Mobile behavior that does not depend on hover; tapping opens the modal.

When filters or search are active, rows only show matching films. Empty rows are hidden. If no films match, show a clear empty-filter state with a reset action.

Clicking a film card opens a hybrid playback modal:

- YouTube/Vimeo iframe player.
- Title, tagline, year, duration, status, and tags.
- `More details` link to `/films/[slug]`.
- Close button.
- Escape key closes the modal.
- Focus should be managed so keyboard users do not fall behind the modal.

The existing `/films/[slug]` detail page remains and continues to serve direct links, description, gallery, and credits.

## Filtering

Use categorized metadata in Sanity and a public search plus filter drawer UI.

Search should match:

- Title
- Tagline
- Display tags
- Locations
- Subjects
- Formats
- Skills

The drawer should expose filters grouped by category:

- Location
- Subject
- Format
- Skill

Filter options are derived from the loaded film catalog. Editors do not need to manage a separate public filter configuration.

Filtering runs client-side over the already-fetched public films. This keeps browsing smooth and avoids additional Sanity requests for each filter interaction.

## Data Flow

Server:

- `getFilms()` fetches the published film catalog from Sanity.
- `getFilmCollections()` fetches enabled curated collections from Sanity.
- The `/films` server page passes serializable data into the client browsing component.

Client:

- `FilmsBrowser` owns search text, selected filters, active modal film, and row controls.
- Pure helper functions build filter options, normalize searchable text, filter films, and create fallback rows.
- The iframe only renders when a modal is open.

## Error Handling

Follow the project rule: fail loud, never fake.

- If Sanity returns no films, show the existing visible empty state.
- If a film has an invalid or missing `videoEmbed`, the modal shows a clear `Video unavailable` state instead of a broken iframe.
- Keep a strict allowlist for YouTube/Vimeo iframe hosts.
- If optional images are missing, use a visible styled poster placeholder with the film title.
- Do not substitute fake films or fake metadata when Sanity data is missing.

## Testing

Add or update tests for:

- Sanity schema registration, including `filmCollection`.
- Filtering/search helpers.
- Row-building helpers for curated rows plus automatic fallback rows.
- Embed URL validation and any URL normalization needed for YouTube/Vimeo.
- Films page empty state.
- Filtered state.
- Modal open/close behavior.

Verification before completion:

- `npm run lint`
- Targeted unit tests for films/Sanity helpers
- `npm run build`

## Out of Scope

- Uploading or hosting video files in Supabase.
- Native `<video>` playback.
- Adaptive streaming/transcoding.
- Moving film metadata to Supabase.
- Per-user film permissions.
- Full external search index.

## Future Options

If the catalog grows large, move filtering/search from client-side to query-backed or indexed search. The categorized metadata shape should still work for that migration.

If BTM later hosts files directly, add Supabase Storage or a dedicated video platform as a separate media-delivery project.
