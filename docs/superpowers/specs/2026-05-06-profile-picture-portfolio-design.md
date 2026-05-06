# Profile Picture Portfolio Design

## Summary

Members can upload a photography/videography portfolio to their profile. The portfolio is visible to registered community members on the member profile page and visible to admins inside the admin contact review flow. Uploads use direct resumable browser-to-Supabase Storage uploads so large image files do not pass through Next.js Server Actions.

## Goals

- Let members upload portfolio images without an app-level file size limit.
- Limit v1 portfolios to 50 images per member to prevent unbounded storage abuse while keeping individual image sizes unrestricted by the app.
- Support `JPEG`, `PNG`, and `WebP` in v1.
- Let members add optional titles and captions.
- Show portfolio images on the public member profile page for authenticated users.
- Show the same portfolio inside the admin dashboard, attached to the matching contact review page.
- Keep storage private and avoid public bucket URLs.
- Backfill and maintain `contacts.profile_id` so admins see portfolio data for existing and future applicants.

## Non-Goals

- HEIC/HEIF support.
- Video uploads.
- Image editing, cropping, or server-side conversion.
- Public anonymous portfolio access.
- Advanced folders, albums, tagging, or drag-and-drop reordering beyond a simple `sort_order` field.

## Chosen Approach

Use a private Supabase Storage bucket plus a relational metadata table. The browser uploads images directly to Supabase using TUS resumable upload. After upload completion, the app records metadata in `profile_portfolio_items`.

This avoids routing large files through the Next.js server, gives the UI progress/retry hooks, and matches Supabase guidance for files larger than small standard uploads.

## Data Model

Create `profile_portfolio_items`:

- `id uuid primary key default gen_random_uuid()`
- `profile_id uuid not null references profiles(id) on delete cascade`
- `storage_path text not null unique`
- `original_filename text not null`
- `mime_type text not null`
- `size_bytes bigint not null`
- `title text null`
- `caption text null`
- `sort_order integer not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- `mime_type in ('image/jpeg', 'image/png', 'image/webp')`
- `size_bytes > 0`
- `char_length(title) <= 120`
- `char_length(caption) <= 1000`

Indexes:

- `(profile_id, sort_order, created_at desc)`
- unique `storage_path`

Types:

- Add `ProfilePortfolioItem` to `src/types/database.ts`.

## Storage

Create private bucket `profile-portfolio`.

Bucket settings:

- `public = false`
- `allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']`
- no app-defined file size limit

Object paths:

- `${profileId}/${crypto.randomUUID()}.${ext}`

Do not overwrite existing paths. New path per upload avoids stale CDN/object caching problems.

## Access Control

Profiles:

- Replace the current anonymous-readable profile select policy with authenticated-only profile visibility.
- Registered users can read profiles.
- Users can still update only their own profile.

Portfolio rows:

- Authenticated users can read portfolio metadata.
- Owners can insert/update/delete their own portfolio rows.
- Admins can read all rows.

Storage objects:

- Bucket remains private.
- Owners can upload and delete objects under their own profile folder.
- Users do not receive broad storage-object read access. Server code generates signed URLs after app-level profile/admin access checks.
- Admins read portfolios through the same server-generated signed URL path.

Signed URLs:

- Data fetchers return portfolio items with short-lived signed image URLs for display.
- Signed URLs are generated server-side with Supabase Storage `createSignedUrls` through the service-role admin client.
- Missing/inaccessible objects fail visibly per item in the UI instead of silently showing fake placeholders or taking down the whole page.

## Upload Flow

Client component:

- Member opens portfolio management in their own `/profile` area.
- User selects one or more files.
- Client validates MIME type only: `JPEG`, `PNG`, `WebP`.
- Client does not enforce a file size limit.
- Client starts direct TUS upload to Supabase Storage using the authenticated session token and direct storage hostname.
- UI shows upload progress, per-file failure, and retry.
- On successful upload, client calls a server action to create the metadata row with optional title/caption, filename, MIME type, size, and storage path.
- V1 disables persisted previous-upload resume unless the object path is recovered with the upload state. In-flight retry still uses TUS retry behavior.

Server action:

- Requires an authenticated user.
- Validates storage path belongs to the current user folder.
- Verifies the object exists in storage before inserting metadata.
- Enforces the v1 50-image item limit per profile.
- Validates MIME type and metadata lengths.
- Inserts the portfolio metadata row.
- Revalidates `/profile`, `/community/members/${profileId}`, `/admin`, and every `/admin/contacts/${contactId}` path linked to the profile.

Delete flow:

- Owner deletes from portfolio management.
- Server action deletes metadata and storage object.
- Deletion fails visibly if either step fails. Prefer deleting metadata after storage succeeds.

Edit flow:

- Owner edits optional title/caption.
- Server action validates and updates only metadata.

## UI Placement

Chosen layout: Option A, Public Gallery + Admin Side Panel.

Member's own profile:

- Add a dedicated `Portfolio` item to the profile sidebar that points to `/profile/portfolio`.
- The management UI supports upload, progress, optional title/caption edit, delete, and empty state.

Community member profile:

- Show a gallery below bio.
- Only authenticated users can reach community profiles.
- Display thumbnails/images, optional title, optional caption, and upload date.
- Empty portfolios should be quiet: no large empty marketing block on other members' pages.

Admin contact detail:

- Show a `Portfolio` card in the right rail near tags.
- Fetch by `contact.profile_id`.
- If no linked profile or no portfolio items, show a concise empty state.
- Keep the admin surface informational in v1; no admin editing of member portfolio items.

## Contact/Profile Linking

Admins see portfolio items through `contacts.profile_id`, so the feature must improve linkage.

Backfill:

- Add a migration that links contacts to profiles by normalized email:
  - `lower(trim(contacts.email)) = lower(trim(profiles.email))`
  - only when `contacts.profile_id is null`

Future application submissions:

- When a logged-in applicant submits an academy application, link the contact to `user.id` if the contact is not already linked.
- Do not overwrite an existing `contacts.profile_id` with a different profile.
- Guest applications continue to work without a profile link.

Registration:

- Existing profile creation flow remains unchanged.
- Backfill covers existing users/contacts.

## Error Handling

- Upload validation failures are shown per file.
- Storage upload failures show the Supabase error message when safe and actionable.
- Metadata insert failures show a visible error and leave the uploaded object discoverable by path for retry/cleanup.
- Signed URL generation failure renders a visible degraded state for the affected item.
- No placeholder/fake images are used to hide broken storage state.

## Performance

- Uploads bypass the Next server and stream directly to Supabase Storage.
- Portfolio fetchers use React `cache()` for per-request deduplication.
- Signed URL generation is batched with `createSignedUrls`.
- Public member profile and admin contact detail fetch portfolio data in parallel with existing page data.
- Images render with constrained thumbnail dimensions and lazy loading.

## Testing

Unit tests:

- Portfolio metadata fetchers return signed URL data and fail loudly on storage errors.
- Upload metadata action rejects unauthenticated users.
- Upload metadata action rejects paths outside the user's folder.
- Upload metadata action rejects unsupported MIME types and overlong title/caption.
- Delete action enforces ownership.
- Contact/profile linking is covered through data-layer tests for logged-in application submission and a checked SQL migration.
- Application submission links a logged-in user's contact without overwriting existing links.

E2E tests:

- Authenticated member can see another member's portfolio on `/community/members/[id]`.
- Anonymous user cannot access member profile/portfolio routes.
- Member can upload an allowed image and see it in their own portfolio.
- Admin sees linked contact portfolio in admin contact detail.

## Documentation References

- Supabase recommends resumable uploads for files greater than small standard uploads and for unstable networks.
- Supabase private buckets require signed URLs or authenticated object access.
- Next.js Server Actions handle form submissions, but the design avoids posting large binary files through Server Actions.
