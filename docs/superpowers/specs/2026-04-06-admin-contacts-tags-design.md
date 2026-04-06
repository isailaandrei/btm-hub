# Admin Contacts & Structured Tags — Design Spec

## Context

Partner A (Flow) wants to use the admin dashboard to organize applicants before the website is public. Currently he uses multiple Google Forms and WhatsApp labels. The immediate need is a CRM-like contacts view where he can tag and filter people — e.g., find everyone who is "decided" for "Azores July." The longer-term vision includes profile pages with chat transcripts, zoom notes, etc., but this spec covers only the contacts + structured tags foundation.

Real application data (159 rows across 4 programs) has been imported from CSV into the `applications` table with `user_id = NULL`.

## Data Model

### New Tables

**`contacts`** — the central "person" entity:

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `email` | text | unique, not null |
| `name` | text | not null |
| `phone` | text | nullable |
| `profile_id` | uuid | nullable, FK → `profiles` |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()` |

**`tag_categories`** — groups like "Interest Level", "Trip":

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `name` | text | unique, not null |
| `color` | text | nullable |
| `sort_order` | integer | default 0 |
| `created_at` | timestamptz | default `now()` |

**`tags`** — values within a category:

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `category_id` | uuid | FK → `tag_categories`, on delete cascade, not null |
| `name` | text | not null |
| `sort_order` | integer | default 0 |

- Unique constraint on `(category_id, name)`

**`contact_tags`** — many-to-many assignments:

| Column | Type | Constraints |
|--------|------|-------------|
| `contact_id` | uuid | FK → `contacts`, on delete cascade |
| `tag_id` | uuid | FK → `tags`, on delete cascade |
| `assigned_at` | timestamptz | default `now()` |

- PK on `(contact_id, tag_id)`

### Modified Tables

**`applications`** — add column:

| Column | Type | Constraints |
|--------|------|-------------|
| `contact_id` | uuid | nullable, FK → `contacts` |

Existing `user_id`, `tags`, and `admin_notes` columns remain unchanged (no migration needed).

### Contact Admin Notes

**`contact_notes`** — admin notes on the contact level:

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `contact_id` | uuid | FK → `contacts`, on delete cascade, not null |
| `author_id` | uuid | FK → `auth.users`, not null |
| `author_name` | text | not null |
| `text` | text | not null, max 2000 chars |
| `created_at` | timestamptz | default `now()` |

### RLS Policies

All new tables: admin-only read/write. Use the same pattern as existing application RLS — check `profiles.role = 'admin'` for the authenticated user.

### Contact Creation from Imported Data

Part of the migration that creates the tables:

1. `SELECT DISTINCT ON (lower(trim(answers->>'email'))) ...` from `applications`
2. Insert into `contacts` (name = `first_name || ' ' || last_name`, email, phone from answers)
3. Update `applications` set `contact_id` = matching contact by email

### Future: Web Form Submissions

When `submitAcademyApplication()` runs, find-or-create a contact by email and set `contact_id` on the new application. This ensures new applicants automatically appear in contacts.

## Admin UI

### Tab Structure

Replace current **Applications | Users** tabs with:

**Contacts | Tags**

### Contacts Tab (Primary View)

**Table columns:**
- Name
- Email
- Phone
- Programs (badges: `filmmaking`, `internship`, etc. — derived from linked applications)
- Tags (colored badges grouped by category)

**Filtering:**
- **Tag filter**: multi-select dropdown, options grouped by category. Selecting multiple tags filters with AND logic (contact must have ALL selected tags).
- **Program filter**: select dropdown to filter contacts who have applications for a specific program.
- **Search**: case-insensitive substring match on name or email.

**Pagination:** 20 per page (same as current).

**Realtime:** Subscribe to `contacts`, `contact_tags`, and `applications` changes to keep the list live.

### Contact Detail Page (`/admin/contacts/[id]`)

**Two-column layout:**

**Left column — Applications:**
- If **1 application**: fully expanded. All answers grouped by form steps (using form definition), same rendering as current application detail page. Status badge and submitted date shown.
- If **2+ applications**: collapsible cards. Header shows program name + status badge + submitted date. Collapsed by default. Expand to see all answers grouped by form steps.

**Right sidebar (300px):**
- **Contact info**: name, email, phone. Editable inline.
- **Tags**: grouped by category. Each category shows as a header with its assigned tags as colored badges (× to remove). A "+" button per category opens a popover/dropdown of that category's available tags to assign. Include a "Create new tag" option at the bottom of each category's dropdown for quick-create.
- **Admin Notes**: chronological list of notes (author, date, text). Form to add new note (textarea, 2000 char limit).

### Tags Management Tab

A settings page for managing the tag taxonomy.

**Layout:** list of category cards.

**Each category card shows:**
- Category name (editable inline or via edit button)
- Category color (color picker or preset palette)
- List of tags within the category (editable, deletable)
- "Add tag" input at the bottom of each category
- Delete category button (with confirmation — cascades to all assignments)

**"Add category" button** at the top/bottom of the page.

### Removed

- Applications tab (no longer needed — application data accessed through contacts)
- `/admin/applications/[id]` route (application detail is inline in contact detail page)
- Users tab (contacts replaces this for the admin's workflow)

## Key Files to Create/Modify

### New files:
- `supabase/migrations/YYYYMMDD_contacts_and_tags.sql` — schema + RLS + contact creation from existing data
- `src/app/(dashboard)/admin/contacts/[id]/page.tsx` — contact detail page
- `src/lib/data/contacts.ts` — data fetchers for contacts, tags, contact_tags
- `src/app/(dashboard)/admin/contacts/actions.ts` — server actions for contact updates, tag assignment, notes
- `src/app/(dashboard)/admin/tags/actions.ts` — server actions for category/tag CRUD
- UI components for tag management, contact detail, filters

### Modified files:
- `src/app/(dashboard)/admin/page.tsx` — replace tab structure (Contacts | Tags)
- `src/app/(dashboard)/admin/layout.tsx` — update data provider if needed
- `src/app/(marketing)/academy/[program]/apply/actions.ts` — find-or-create contact on submission
- `src/lib/data/applications.ts` — update `submitApplication()` to accept `contact_id`
- `src/types/database.ts` — add Contact, TagCategory, Tag, ContactTag types

### Removed files:
- `src/app/(dashboard)/admin/applications/[id]/page.tsx` and its components

## Not in Scope

- Migrating existing application-level tags or admin_notes to contacts
- Chat transcripts, zoom call notes, or other data sources
- Drag-to-reorder for tags/categories
- Bulk tag assignment (select multiple contacts → assign tag)
- Export/CSV download of filtered contacts
