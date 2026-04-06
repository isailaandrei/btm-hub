# Admin Contacts & Structured Tags — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the applications-centric admin dashboard with a contacts-based CRM view where the admin can organize people using structured tags (categories with values) and filter/search across them.

**Architecture:** New `contacts`, `tag_categories`, `tags`, `contact_tags`, and `contact_notes` tables. Contacts are auto-created from existing application data by email. Admin UI gets two tabs: Contacts (table with filtering) and Tags (category/tag management). Contact detail page shows all applications inline with tag assignment and notes in a sidebar.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (PostgREST + RLS + Realtime), TypeScript, Tailwind CSS 4, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-06-admin-contacts-tags-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260406000001_contacts_and_tags.sql` | Schema, RLS, seed contacts from existing data |
| `src/lib/data/contacts.ts` | Server-side data fetchers and mutations for contacts, tags, notes |
| `src/app/(dashboard)/admin/contacts/actions.ts` | Server actions: tag assignment, notes, contact updates |
| `src/app/(dashboard)/admin/tags/actions.ts` | Server actions: category/tag CRUD |
| `src/app/(dashboard)/admin/tags/tags-panel.tsx` | Tag management UI (categories + tags CRUD) |
| `src/app/(dashboard)/admin/contacts/contacts-panel.tsx` | Contacts table with filtering and pagination |
| `src/app/(dashboard)/admin/contacts/contacts-filters.tsx` | Filter controls (tag, program, search) |
| `src/app/(dashboard)/admin/contacts/[id]/page.tsx` | Contact detail page (server component) |
| `src/app/(dashboard)/admin/contacts/[id]/application-card.tsx` | Collapsible application answers display |
| `src/app/(dashboard)/admin/contacts/[id]/contact-tag-manager.tsx` | Tag assignment per category with quick-create |
| `src/app/(dashboard)/admin/contacts/[id]/contact-note-form.tsx` | Contact-level admin notes |

### Modified files
| File | Change |
|------|--------|
| `src/types/database.ts` | Add Contact, TagCategory, Tag, ContactTag, ContactNote types |
| `src/app/(dashboard)/admin/page.tsx` | Replace tabs: Contacts + Tags |
| `src/app/(dashboard)/admin/admin-data-provider.tsx` | Add contacts, tags, contactTags state + realtime |
| `src/app/(marketing)/academy/[program]/apply/actions.ts` | Find-or-create contact on submission |

### Files to remove (Task 10)
- `src/app/(dashboard)/admin/applications/applications-panel.tsx`
- `src/app/(dashboard)/admin/applications/filters.tsx`
- `src/app/(dashboard)/admin/applications/[id]/page.tsx`
- `src/app/(dashboard)/admin/applications/[id]/TagManager.tsx`
- `src/app/(dashboard)/admin/applications/[id]/NoteForm.tsx`
- `src/app/(dashboard)/admin/applications/[id]/error.tsx`
- `src/app/(dashboard)/admin/applications/[id]/loading.tsx`
- `src/app/(dashboard)/admin/applications/page.tsx`
- `src/app/(dashboard)/admin/users/users-panel.tsx`

### Files to keep (still used by share links, applicant-facing views)
- `src/app/(dashboard)/admin/applications/actions.ts` — `changeStatus` still needed from contact detail
- `src/app/(dashboard)/admin/applications/[id]/StatusSelector.tsx` — reused in `ApplicationCard`
- `src/app/(dashboard)/admin/applications/constants.ts` — `STATUS_BADGE_CLASS`, `STATUSES`, `PROGRAMS` still used
- `src/lib/data/applications.ts` — data layer still needed
- `src/lib/data/applicant-name.ts` — `getApplicantName()` reused in contacts

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260406000001_contacts_and_tags.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- contacts table
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  phone text,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- tag_categories table
CREATE TABLE tag_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  color text,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- tags table
CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES tag_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  UNIQUE (category_id, name)
);

-- contact_tags junction table
CREATE TABLE contact_tags (
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (contact_id, tag_id)
);

-- contact_notes table
CREATE TABLE contact_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  author_name text NOT NULL,
  text text NOT NULL CHECK (char_length(text) <= 2000),
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Add contact_id to applications
ALTER TABLE applications ADD COLUMN contact_id uuid REFERENCES contacts(id);

-- Indexes
CREATE INDEX idx_contacts_email ON contacts (lower(email));
CREATE INDEX idx_contacts_profile_id ON contacts (profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX idx_tags_category_id ON tags (category_id);
CREATE INDEX idx_contact_tags_contact_id ON contact_tags (contact_id);
CREATE INDEX idx_contact_tags_tag_id ON contact_tags (tag_id);
CREATE INDEX idx_contact_notes_contact_id ON contact_notes (contact_id);
CREATE INDEX idx_applications_contact_id ON applications (contact_id) WHERE contact_id IS NOT NULL;

-- Enable RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;

-- RLS: Admin-only for all new tables (same pattern as existing application policies)
CREATE POLICY "Admins can read contacts" ON contacts
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can insert contacts" ON contacts
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can update contacts" ON contacts
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can delete contacts" ON contacts
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can read tag_categories" ON tag_categories
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can insert tag_categories" ON tag_categories
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can update tag_categories" ON tag_categories
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can delete tag_categories" ON tag_categories
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can read tags" ON tags
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can insert tags" ON tags
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can update tags" ON tags
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can delete tags" ON tags
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can read contact_tags" ON contact_tags
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can insert contact_tags" ON contact_tags
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can delete contact_tags" ON contact_tags
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can read contact_notes" ON contact_notes
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can insert contact_notes" ON contact_notes
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- Also allow the application submission flow to insert/read contacts (for find-or-create)
CREATE POLICY "Anyone can insert contacts on submission" ON contacts
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read contacts by email" ON contacts
  FOR SELECT USING (true);

-- Enable Realtime for relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags;
ALTER PUBLICATION supabase_realtime ADD TABLE tag_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE tags;

-- Seed contacts from existing applications
INSERT INTO contacts (email, name, phone)
SELECT DISTINCT ON (lower(trim(answers->>'email')))
  lower(trim(answers->>'email')),
  coalesce(
    nullif(trim(
      coalesce(answers->>'first_name', '') || ' ' || coalesce(answers->>'last_name', '')
    ), ''),
    'Unknown'
  ),
  nullif(trim(answers->>'phone'), '')
FROM applications
WHERE answers->>'email' IS NOT NULL
  AND trim(answers->>'email') != ''
ORDER BY lower(trim(answers->>'email')), submitted_at ASC;

-- Link existing applications to their contacts
UPDATE applications a
SET contact_id = c.id
FROM contacts c
WHERE lower(trim(a.answers->>'email')) = c.email
  AND a.contact_id IS NULL;
```

- [ ] **Step 2: Test the migration locally**

Run: `supabase db reset` (automated via hook — resets and re-applies all migrations)

Expected: No errors. Verify with:
```bash
supabase db reset
```
Then check in Supabase Studio (http://localhost:54323) that:
- All 5 new tables exist with correct columns
- `contacts` table is populated (count should match unique emails from applications)
- `applications.contact_id` is populated for all rows
- RLS policies are in place

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260406000001_contacts_and_tags.sql
git commit -m "feat(db): add contacts, tags, and notes tables with RLS"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add new types**

Add these types after the existing `AdminNote` interface (after line 38):

```typescript
// ---------------------------------------------------------------------------
// Contacts & Tags
// ---------------------------------------------------------------------------

export interface Contact {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TagCategory {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: string;
}

export interface Tag {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
}

export interface TagWithCategory extends Tag {
  category: TagCategory;
}

export interface ContactTag {
  contact_id: string;
  tag_id: string;
  assigned_at: string;
}

export interface ContactNote {
  id: string;
  contact_id: string;
  author_id: string;
  author_name: string;
  text: string;
  created_at: string;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

Expected: No type errors (existing code is unaffected).

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add Contact, Tag, and ContactNote types"
```

---

## Task 3: Data Layer

**Files:**
- Create: `src/lib/data/contacts.ts`

This file provides all server-side data access for contacts, tags, and contact notes. It follows the same patterns as `src/lib/data/applications.ts`: uses `createClient()` from `@/lib/supabase/server`, wraps reads in `cache()`, and requires admin for writes.

- [ ] **Step 1: Create the data layer file**

```typescript
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import type {
  Contact,
  TagCategory,
  Tag,
  ContactNote,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Contacts — Read
// ---------------------------------------------------------------------------

export const getContacts = cache(async function getContacts() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(`Failed to load contacts: ${error.message}`);
  return data as Contact[];
});

export const getContactById = cache(async function getContactById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as Contact;
});

// ---------------------------------------------------------------------------
// Contacts — Write
// ---------------------------------------------------------------------------

export async function updateContact(
  id: string,
  fields: { name?: string; email?: string; phone?: string | null },
) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to update contact: ${error.message}`);
}

/**
 * Find or create a contact by email. Used during application submission.
 * Does NOT require admin — called from the public submission flow.
 */
export async function findOrCreateContact(
  email: string,
  name: string,
  phone: string | null,
): Promise<string> {
  const supabase = await createClient();
  const normalizedEmail = email.toLowerCase().trim();

  // Try to find existing contact
  const { data: existing } = await supabase
    .from("contacts")
    .select("id")
    .eq("email", normalizedEmail)
    .single();

  if (existing) return existing.id;

  // Create new contact
  const { data: created, error } = await supabase
    .from("contacts")
    .insert({ email: normalizedEmail, name, phone })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create contact: ${error.message}`);
  return created.id;
}

// ---------------------------------------------------------------------------
// Tag Categories — CRUD
// ---------------------------------------------------------------------------

export const getTagCategories = cache(async function getTagCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tag_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load tag categories: ${error.message}`);
  return data as TagCategory[];
});

export async function createTagCategory(name: string, color: string | null) {
  await requireAdmin();
  const supabase = await createClient();

  // Set sort_order to max + 1
  const { data: maxRow } = await supabase
    .from("tag_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  const sortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("tag_categories")
    .insert({ name, color, sort_order: sortOrder })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create category: ${error.message}`);
  return data as TagCategory;
}

export async function updateTagCategory(
  id: string,
  fields: { name?: string; color?: string | null },
) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("tag_categories")
    .update(fields)
    .eq("id", id);

  if (error) throw new Error(`Failed to update category: ${error.message}`);
}

export async function deleteTagCategory(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("tag_categories")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete category: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Tags — CRUD
// ---------------------------------------------------------------------------

export const getTags = cache(async function getTags() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load tags: ${error.message}`);
  return data as Tag[];
});

export async function createTag(categoryId: string, name: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("tags")
    .select("sort_order")
    .eq("category_id", categoryId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  const sortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("tags")
    .insert({ category_id: categoryId, name, sort_order: sortOrder })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create tag: ${error.message}`);
  return data as Tag;
}

export async function updateTag(id: string, name: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .update({ name })
    .eq("id", id);

  if (error) throw new Error(`Failed to update tag: ${error.message}`);
}

export async function deleteTag(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete tag: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Contact Tags — assign / remove
// ---------------------------------------------------------------------------

export const getContactTags = cache(async function getContactTags(contactId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_tags")
    .select("tag_id, assigned_at, tags(*, tag_categories(*))")
    .eq("contact_id", contactId);

  if (error) throw new Error(`Failed to load contact tags: ${error.message}`);
  return data;
});

export async function assignTag(contactId: string, tagId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_tags")
    .upsert({ contact_id: contactId, tag_id: tagId }, { onConflict: "contact_id,tag_id" });

  if (error) throw new Error(`Failed to assign tag: ${error.message}`);
}

export async function unassignTag(contactId: string, tagId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_tags")
    .delete()
    .eq("contact_id", contactId)
    .eq("tag_id", tagId);

  if (error) throw new Error(`Failed to remove tag: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Contact Notes
// ---------------------------------------------------------------------------

export const getContactNotes = cache(async function getContactNotes(contactId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_notes")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load contact notes: ${error.message}`);
  return data as ContactNote[];
});

export async function addContactNote(
  contactId: string,
  authorId: string,
  authorName: string,
  text: string,
) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_notes")
    .insert({ contact_id: contactId, author_id: authorId, author_name: authorName, text });

  if (error) throw new Error(`Failed to add note: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Applications for a contact
// ---------------------------------------------------------------------------

export const getApplicationsByContactId = cache(
  async function getApplicationsByContactId(contactId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .eq("contact_id", contactId)
      .order("submitted_at", { ascending: false });

    if (error) throw new Error(`Failed to load applications: ${error.message}`);
    return data;
  },
);
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/contacts.ts
git commit -m "feat: add contacts data layer with CRUD for contacts, tags, and notes"
```

---

## Task 4: Server Actions — Tag Management

**Files:**
- Create: `src/app/(dashboard)/admin/tags/actions.ts`

- [ ] **Step 1: Create the tag management actions**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateUUID } from "@/lib/validation-helpers";
import {
  createTagCategory,
  updateTagCategory,
  deleteTagCategory,
  createTag,
  updateTag,
  deleteTag,
} from "@/lib/data/contacts";

export async function addCategory(name: string, color: string | null) {
  await requireAdmin();
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) throw new Error("Category name is required");
  await createTagCategory(trimmed, color);
  revalidatePath("/admin");
}

export async function editCategory(id: string, fields: { name?: string; color?: string | null }) {
  validateUUID(id);
  await requireAdmin();
  if (fields.name !== undefined) {
    fields.name = fields.name.trim().slice(0, 100);
    if (!fields.name) throw new Error("Category name is required");
  }
  await updateTagCategory(id, fields);
  revalidatePath("/admin");
}

export async function removeCategory(id: string) {
  validateUUID(id);
  await requireAdmin();
  await deleteTagCategory(id);
  revalidatePath("/admin");
}

export async function addTagToCategory(categoryId: string, name: string) {
  validateUUID(categoryId);
  await requireAdmin();
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) throw new Error("Tag name is required");
  await createTag(categoryId, trimmed);
  revalidatePath("/admin");
}

export async function editTag(tagId: string, name: string) {
  validateUUID(tagId);
  await requireAdmin();
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) throw new Error("Tag name is required");
  await updateTag(tagId, trimmed);
  revalidatePath("/admin");
}

export async function removeTag(tagId: string) {
  validateUUID(tagId);
  await requireAdmin();
  await deleteTag(tagId);
  revalidatePath("/admin");
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/admin/tags/actions.ts
git commit -m "feat: add server actions for tag category and tag CRUD"
```

---

## Task 5: Server Actions — Contacts

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/actions.ts`

- [ ] **Step 1: Create the contact actions**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateUUID } from "@/lib/validation-helpers";
import {
  updateContact,
  assignTag,
  unassignTag,
  addContactNote,
} from "@/lib/data/contacts";

export async function editContact(
  contactId: string,
  fields: { name?: string; email?: string; phone?: string | null },
) {
  validateUUID(contactId);
  await requireAdmin();
  if (fields.name !== undefined) {
    fields.name = fields.name.trim();
    if (!fields.name) throw new Error("Name is required");
  }
  if (fields.email !== undefined) {
    fields.email = fields.email.trim().toLowerCase();
    if (!fields.email) throw new Error("Email is required");
  }
  await updateContact(contactId, fields);
  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin");
}

export async function assignContactTag(contactId: string, tagId: string) {
  validateUUID(contactId);
  validateUUID(tagId);
  await requireAdmin();
  await assignTag(contactId, tagId);
  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin");
}

export async function unassignContactTag(contactId: string, tagId: string) {
  validateUUID(contactId);
  validateUUID(tagId);
  await requireAdmin();
  await unassignTag(contactId, tagId);
  revalidatePath(`/admin/contacts/${contactId}`);
  revalidatePath("/admin");
}

export async function addNote(contactId: string, text: string) {
  validateUUID(contactId);
  const profile = await requireAdmin();
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) return;
  await addContactNote(contactId, profile.id, profile.display_name ?? profile.email, trimmed);
  revalidatePath(`/admin/contacts/${contactId}`);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/admin/contacts/actions.ts
git commit -m "feat: add server actions for contact updates, tag assignment, and notes"
```

---

## Task 6: Admin Data Provider Update

**Files:**
- Modify: `src/app/(dashboard)/admin/admin-data-provider.tsx`

The provider needs to manage 4 new datasets alongside the existing ones: `contacts`, `tagCategories`, `tags`, and `contactTags`. Each gets the same lazy-load + Realtime pattern.

- [ ] **Step 1: Update the context type and add new state**

Add to the imports in `admin-data-provider.tsx`:

```typescript
import type { Application, Profile, Contact, TagCategory, Tag, ContactTag } from "@/types/database";
```

Update `AdminDataContextValue` to add:

```typescript
interface AdminDataContextValue {
  applications: Application[] | null;
  profiles: Profile[] | null;
  contacts: Contact[] | null;
  tagCategories: TagCategory[] | null;
  tags: Tag[] | null;
  contactTags: ContactTag[] | null;
  appsError: string | null;
  profilesError: string | null;
  contactsError: string | null;
  ensureApplications: () => void;
  ensureProfiles: () => void;
  ensureContacts: () => void;
}
```

- [ ] **Step 2: Add contacts state and ensureContacts callback**

Add new state variables alongside the existing `applications`/`profiles` state:

```typescript
const [contacts, setContacts] = useState<Contact[] | null>(null);
const [tagCategories, setTagCategories] = useState<TagCategory[] | null>(null);
const [tags, setTags] = useState<Tag[] | null>(null);
const [contactTags, setContactTags] = useState<ContactTag[] | null>(null);
const [contactsError, setContactsError] = useState<string | null>(null);

const contactsFetchState = useRef<FetchState>("idle");
```

Add the `ensureContacts` callback. It fetches all 4 tables in parallel, then sets up Realtime subscriptions for `contacts`, `contact_tags`, `tag_categories`, and `tags`. Follow the exact same pattern as `ensureApplications`:

```typescript
const ensureContacts = useCallback(() => {
  if (contactsFetchState.current !== "idle") return;
  contactsFetchState.current = "loading";

  const supabase = getSupabase();

  async function fetchContacts() {
    const [contactsRes, categoriesRes, tagsRes, contactTagsRes] = await Promise.all([
      supabase.from("contacts").select("*").order("name"),
      supabase.from("tag_categories").select("*").order("sort_order"),
      supabase.from("tags").select("*").order("sort_order"),
      supabase.from("contact_tags").select("*"),
    ]);

    if (contactsRes.error || categoriesRes.error || tagsRes.error || contactTagsRes.error) {
      contactsFetchState.current = "idle";
      setContactsError("Failed to load contacts data.");
      toast.error("Failed to load contacts. Please try again.");
      return;
    }

    setContactsError(null);
    setContacts(contactsRes.data as Contact[]);
    setTagCategories(categoriesRes.data as TagCategory[]);
    setTags(tagsRes.data as Tag[]);
    setContactTags(contactTagsRes.data as ContactTag[]);
    contactsFetchState.current = "done";

    // Realtime subscriptions for contacts
    const contactsChannel = supabase
      .channel("admin-contacts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contacts" },
        (payload) => setContacts((prev) => [...(prev ?? []), payload.new as Contact]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contacts" },
        (payload) => setContacts((prev) => (prev ?? []).map((c) =>
          c.id === (payload.new as Contact).id ? (payload.new as Contact) : c)))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "contacts" },
        (payload) => setContacts((prev) => (prev ?? []).filter((c) => c.id !== (payload.old as Contact).id)))
      .subscribe();
    channelsRef.current.push(contactsChannel);

    // Realtime for contact_tags
    const ctChannel = supabase
      .channel("admin-contact-tags")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contact_tags" },
        (payload) => setContactTags((prev) => [...(prev ?? []), payload.new as ContactTag]))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "contact_tags" },
        (payload) => {
          const old = payload.old as ContactTag;
          setContactTags((prev) => (prev ?? []).filter(
            (ct) => !(ct.contact_id === old.contact_id && ct.tag_id === old.tag_id)
          ));
        })
      .subscribe();
    channelsRef.current.push(ctChannel);

    // Realtime for tag_categories
    const catChannel = supabase
      .channel("admin-tag-categories")
      .on("postgres_changes", { event: "*", schema: "public", table: "tag_categories" },
        () => {
          // Refetch all categories on any change (simple, low volume)
          supabase.from("tag_categories").select("*").order("sort_order")
            .then(({ data }) => { if (data) setTagCategories(data as TagCategory[]); });
        })
      .subscribe();
    channelsRef.current.push(catChannel);

    // Realtime for tags
    const tagsChannel = supabase
      .channel("admin-tags")
      .on("postgres_changes", { event: "*", schema: "public", table: "tags" },
        () => {
          supabase.from("tags").select("*").order("sort_order")
            .then(({ data }) => { if (data) setTags(data as Tag[]); });
        })
      .subscribe();
    channelsRef.current.push(tagsChannel);
  }

  fetchContacts();
}, []);
```

- [ ] **Step 3: Update the context Provider value**

Update the `value` prop to include all new state and the `ensureContacts` function:

```typescript
value={{
  applications, profiles, contacts, tagCategories, tags, contactTags,
  appsError, profilesError, contactsError,
  ensureApplications, ensureProfiles, ensureContacts,
}}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/admin/admin-data-provider.tsx
git commit -m "feat: add contacts, tags, and contact_tags to admin data provider"
```

---

## Task 7: Tags Management Panel

**Files:**
- Create: `src/app/(dashboard)/admin/tags/tags-panel.tsx`

A client component for managing tag categories and their tags. Uses `useAdminData()` to read `tagCategories` and `tags`, and calls server actions from `./actions.ts` for mutations.

- [ ] **Step 1: Create the tags panel component**

Structure:
- Top-level "Add Category" button + form (name input, color select from preset palette)
- List of category cards, each showing:
  - Category name (editable via inline input on click)
  - Color indicator (small circle or badge)
  - "Edit color" button — shows preset color palette inline
  - List of tags as editable items (click to edit name, × to delete)
  - "Add tag" input at bottom of each category
  - "Delete category" button with confirm dialog

Color presets (use Tailwind-compatible oklch values already in the design system):
```typescript
const COLOR_PRESETS = [
  { label: "Red", value: "red" },
  { label: "Orange", value: "orange" },
  { label: "Yellow", value: "yellow" },
  { label: "Green", value: "green" },
  { label: "Blue", value: "blue" },
  { label: "Purple", value: "purple" },
  { label: "Pink", value: "pink" },
] as const;
```

Use these colors for badge rendering throughout the app:
```typescript
export const TAG_COLOR_CLASSES: Record<string, string> = {
  red: "border-red-500/40 bg-red-500/10 text-red-400",
  orange: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  yellow: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  green: "border-green-500/40 bg-green-500/10 text-green-400",
  blue: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  purple: "border-purple-500/40 bg-purple-500/10 text-purple-400",
  pink: "border-pink-500/40 bg-pink-500/10 text-pink-400",
};
```

Export `TAG_COLOR_CLASSES` from this file — it will be used by the contacts panel and contact detail page too.

Component must:
- Call `ensureContacts()` on mount (via `useEffect`) to load tag data
- Show a skeleton/loading state while `tagCategories === null`
- Use `useTransition` + `toast` for all mutations (same pattern as existing `TagManager`)
- Call server actions from `@/app/(dashboard)/admin/tags/actions`

- [ ] **Step 2: Verify it renders**

Run: `npm run dev`, navigate to `/admin`, verify the Tags tab loads (after wiring in Task 10). For now, just verify it compiles:

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/admin/tags/tags-panel.tsx
git commit -m "feat: add tag management panel with category and tag CRUD"
```

---

## Task 8: Contacts Panel

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/contacts-filters.tsx`
- Create: `src/app/(dashboard)/admin/contacts/contacts-panel.tsx`

### Contacts Filters

- [ ] **Step 1: Create the contacts filter component**

Props:
```typescript
interface ContactsFiltersProps {
  search: string;
  selectedProgram: ProgramSlug | undefined;
  selectedTagIds: string[];
  tagCategories: TagCategory[];
  tags: Tag[];
  onSearchChange: (value: string) => void;
  onProgramChange: (value: ProgramSlug | undefined) => void;
  onTagToggle: (tagId: string) => void;
  onClearTags: () => void;
}
```

Structure:
- **Search**: Text input + submit button (same pattern as existing `ApplicationFilters` in `src/app/(dashboard)/admin/applications/filters.tsx`)
- **Program**: `Select` dropdown — "All Programs" + each program from `PROGRAMS` constant (import from `../applications/constants`)
- **Tags**: A row of tag badges grouped by category. Each tag is clickable to toggle selection (active = filled, inactive = outline). Selected tags shown as active/highlighted. A "Clear" button if any tags selected. Use `TAG_COLOR_CLASSES` from the tags panel for coloring.

- [ ] **Step 2: Create the contacts panel component**

The contacts panel follows the same structure as `ApplicationsPanel` (`src/app/(dashboard)/admin/applications/applications-panel.tsx`).

Uses `useAdminData()` to get `contacts`, `tagCategories`, `tags`, `contactTags`, `applications`, `contactsError`, and `ensureContacts`.

Also calls `ensureApplications()` on mount because we need application data to show program badges.

State:
```typescript
const [search, setSearch] = useState("");
const [selectedProgram, setSelectedProgram] = useState<ProgramSlug | undefined>();
const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
const [page, setPage] = useState(1);
```

Filtering logic (in `useMemo`):
1. If `search` is set, filter contacts where `name` or `email` includes the search string (case-insensitive)
2. If `selectedProgram` is set, filter contacts that have at least one application with that program
3. If `selectedTagIds` is non-empty, filter contacts that have ALL selected tags (AND logic) — check against `contactTags`

Table columns:
- **Name** — linked to `/admin/contacts/${contact.id}`
- **Email**
- **Phone** — or "—"
- **Programs** — derive from `applications` array: unique program slugs as capitalized `Badge` components
- **Tags** — derive from `contactTags` + `tags` + `tagCategories`: show as colored `Badge` components using `TAG_COLOR_CLASSES`

Pagination: same pattern as `ApplicationsPanel` — `PAGE_SIZE = 20`, previous/next buttons.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/admin/contacts/contacts-filters.tsx src/app/(dashboard)/admin/contacts/contacts-panel.tsx
git commit -m "feat: add contacts panel with tag/program/search filtering"
```

---

## Task 9: Contact Detail Page

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/[id]/page.tsx`
- Create: `src/app/(dashboard)/admin/contacts/[id]/application-card.tsx`
- Create: `src/app/(dashboard)/admin/contacts/[id]/contact-tag-manager.tsx`
- Create: `src/app/(dashboard)/admin/contacts/[id]/contact-note-form.tsx`

### Contact Detail Page (Server Component)

- [ ] **Step 1: Create the contact detail page**

This is a **server component** that fetches the contact, their applications, tags, and notes. It reuses the same answer-rendering logic from the existing `ApplicationDetailPage` (`src/app/(dashboard)/admin/applications/[id]/page.tsx`).

```typescript
// src/app/(dashboard)/admin/contacts/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getContactById,
  getApplicationsByContactId,
  getContactTags,
  getContactNotes,
  getTagCategories,
  getTags,
} from "@/lib/data/contacts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ApplicationCard } from "./application-card";
import { ContactTagManager } from "./contact-tag-manager";
import { ContactNoteForm } from "./contact-note-form";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [contact, applications, contactTagRows, notes, categories, allTags] =
    await Promise.all([
      getContactById(id),
      getApplicationsByContactId(id),
      getContactTags(id),
      getContactNotes(id),
      getTagCategories(),
      getTags(),
    ]);

  if (!contact) return notFound();

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin"
          className="mb-2 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          &larr; Back to contacts
        </Link>
        <h1 className="text-[length:var(--font-size-h2)] font-medium text-foreground">
          {contact.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{contact.email}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Left column — Applications */}
        <div className="flex flex-col gap-6">
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications yet.</p>
          ) : applications.length === 1 ? (
            <ApplicationCard application={applications[0]} defaultOpen />
          ) : (
            applications.map((app) => (
              <ApplicationCard key={app.id} application={app} defaultOpen={false} />
            ))
          )}
        </div>

        {/* Right sidebar */}
        <div className="flex flex-col gap-6">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Contact Info</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">Email</dt><dd>{contact.email}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Phone</dt><dd>{contact.phone || "—"}</dd></div>
              </dl>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <ContactTagManager
                contactId={contact.id}
                contactTagRows={contactTagRows}
                categories={categories}
                allTags={allTags}
              />
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Admin Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {notes.length > 0 && (
                <div className="mb-4 flex flex-col gap-3">
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-md border border-border bg-muted/30 p-3">
                      <p className="text-sm text-foreground">{note.text}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {note.author_name} &middot; {new Date(note.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <ContactNoteForm contactId={contact.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

### Application Card (Client Component)

- [ ] **Step 2: Create the application card component**

A collapsible card showing one application's answers. Uses the same form-step-based rendering as the existing application detail page (`src/app/(dashboard)/admin/applications/[id]/page.tsx` lines 64-102).

```typescript
// src/app/(dashboard)/admin/contacts/[id]/application-card.tsx
"use client";

import { useState } from "react";
import { getFormDefinition } from "@/lib/academy/forms";
import type { Application } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { STATUS_BADGE_CLASS } from "../../applications/constants";
import { StatusSelector } from "../../applications/[id]/StatusSelector";
```

Props: `{ application: Application; defaultOpen: boolean }`

State: `const [open, setOpen] = useState(defaultOpen);`

Structure:
- Card with a clickable header showing: program name (capitalized), status badge, submitted date, expand/collapse chevron
- When open, render the `StatusSelector` at the top (reuse existing component from `../../applications/[id]/StatusSelector`), then all form answers grouped by step (same rendering as existing detail page)
- Reuse the `formatValue()` helper (copy it into this file or extract it to a shared util)

**Important:** The `StatusSelector` component imports `changeStatus` from `../actions` (relative to the `[id]` directory). Since we're in a different directory now, we need to ensure `StatusSelector` still works — it imports from `"../actions"` which resolves to `src/app/(dashboard)/admin/applications/actions.ts`. Since `StatusSelector` stays in its original location and we import it from there, the relative import within `StatusSelector` still works.

### Contact Tag Manager (Client Component)

- [ ] **Step 3: Create the contact tag manager component**

Props:
```typescript
interface ContactTagManagerProps {
  contactId: string;
  contactTagRows: Array<{ tag_id: string; assigned_at: string; tags: { id: string; name: string; category_id: string; tag_categories: { id: string; name: string; color: string | null } } }>;
  categories: TagCategory[];
  allTags: Tag[];
}
```

Structure:
- Groups assigned tags by category
- For each category that has assigned tags, shows category name as a small header and assigned tags as colored badges with × button to remove (calls `unassignContactTag`)
- For each category, a "+" button that shows a dropdown/popover of unassigned tags from that category. Clicking a tag calls `assignContactTag`. At the bottom of the dropdown, a "Create new tag" option with an inline input that calls `addTagToCategory` (from tags actions) then immediately assigns it
- Categories with no assigned tags still show the "+" button with category name
- Uses `useTransition` + `toast` for all mutations
- Import `TAG_COLOR_CLASSES` from `../../tags/tags-panel` for badge coloring
- Import `assignContactTag`, `unassignContactTag` from `../actions`
- Import `addTagToCategory` from `../../tags/actions`

### Contact Note Form (Client Component)

- [ ] **Step 4: Create the contact note form**

Same as existing `NoteForm` (`src/app/(dashboard)/admin/applications/[id]/NoteForm.tsx`) but calls the contact-level `addNote` from `../actions` instead. Copy the structure and update the import.

```typescript
// src/app/(dashboard)/admin/contacts/[id]/contact-note-form.tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addNote } from "../actions";

interface ContactNoteFormProps {
  contactId: string;
}

export function ContactNoteForm({ contactId }: ContactNoteFormProps) {
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    startTransition(async () => {
      try {
        await addNote(contactId, text);
        setText("");
      } catch {
        toast.error("Failed to add note. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note..."
        rows={3}
        className="resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={isPending || !text.trim()}
        className="self-end rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Adding..." : "Add Note"}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/admin/contacts/
git commit -m "feat: add contact detail page with application cards, tag manager, and notes"
```

---

## Task 10: Rewire Admin Page & Cleanup

**Files:**
- Modify: `src/app/(dashboard)/admin/page.tsx`
- Delete: old application panel files, users panel, application detail files

- [ ] **Step 1: Update admin page with new tabs**

Replace the contents of `src/app/(dashboard)/admin/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useAdminData } from "./admin-data-provider";
import { ContactsPanel } from "./contacts/contacts-panel";
import { TagsPanel } from "./tags/tags-panel";

type Tab = "contacts" | "tags";

const TABS: { key: Tab; label: string }[] = [
  { key: "contacts", label: "Contacts" },
  { key: "tags", label: "Tags" },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("contacts");
  const { ensureContacts, ensureApplications } = useAdminData();

  useEffect(() => {
    // Contacts tab needs both contacts and applications data
    if (activeTab === "contacts") {
      ensureContacts();
      ensureApplications();
    } else {
      ensureContacts(); // Tags tab also needs tag data from ensureContacts
    }
  }, [activeTab, ensureContacts, ensureApplications]);

  return (
    <div>
      <nav className="mb-8 flex gap-1 border-b border-border pb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "contacts" ? <ContactsPanel /> : <TagsPanel />}
    </div>
  );
}
```

- [ ] **Step 2: Delete old files**

Remove the files listed in "Files to remove" at the top of this plan:

```bash
rm src/app/(dashboard)/admin/applications/applications-panel.tsx
rm src/app/(dashboard)/admin/applications/filters.tsx
rm src/app/(dashboard)/admin/applications/page.tsx
rm "src/app/(dashboard)/admin/applications/[id]/page.tsx"
rm "src/app/(dashboard)/admin/applications/[id]/TagManager.tsx"
rm "src/app/(dashboard)/admin/applications/[id]/NoteForm.tsx"
rm "src/app/(dashboard)/admin/applications/[id]/error.tsx"
rm "src/app/(dashboard)/admin/applications/[id]/loading.tsx"
rm src/app/(dashboard)/admin/users/users-panel.tsx
```

**Keep** these files (still used):
- `src/app/(dashboard)/admin/applications/actions.ts` — `changeStatus` is called from `StatusSelector` which is reused in the contact detail page
- `src/app/(dashboard)/admin/applications/constants.ts` — `STATUS_BADGE_CLASS`, `STATUSES`, `PROGRAMS`
- `src/app/(dashboard)/admin/applications/[id]/StatusSelector.tsx` — reused in `ApplicationCard`
- `src/app/(dashboard)/admin/applications/actions.test.ts` — existing tests

- [ ] **Step 3: Verify it compiles and the dev server runs**

Run: `npx tsc --noEmit`
Run: `npm run dev` — navigate to `/admin`, verify Contacts and Tags tabs render.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: rewire admin dashboard to Contacts + Tags tabs, remove old panels"
```

---

## Task 11: Web Form Integration

**Files:**
- Modify: `src/app/(marketing)/academy/[program]/apply/actions.ts`

- [ ] **Step 1: Read the current submission action**

Read `src/app/(marketing)/academy/[program]/apply/actions.ts` to understand the current `submitAcademyApplication` function. Find where it calls `submitApplication()` and add the `findOrCreateContact` call before it.

- [ ] **Step 2: Add find-or-create contact on submission**

Add import at top of the file:
```typescript
import { findOrCreateContact } from "@/lib/data/contacts";
```

In the `submitAcademyApplication` function, after parsing the form data and validating, but before calling `submitApplication()`:

```typescript
// Find or create contact from the applicant's email
const contactId = await findOrCreateContact(
  parsed.email,
  [parsed.first_name, parsed.last_name].filter(Boolean).join(" ") || "Unknown",
  parsed.phone ?? null,
);
```

Then pass `contactId` to the `submitApplication()` call. This requires checking how `submitApplication` is called — it likely accepts an object with program, answers, userId. Add `contact_id` to the insert data.

Also update `submitApplication()` in `src/lib/data/applications.ts` to accept and pass through `contactId`:

```typescript
export async function submitApplication(
  program: ProgramSlug,
  answers: Record<string, unknown>,
  userId: string | null,
  contactId: string | null = null,
) {
  // ... existing code ...
  const { error } = await supabase.from("applications").insert({
    program,
    answers,
    user_id: userId,
    contact_id: contactId,
  });
  // ...
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/(marketing)/academy/[program]/apply/actions.ts src/lib/data/applications.ts
git commit -m "feat: auto-create contact when submitting academy application"
```

---

## Verification

After all tasks are complete:

1. **Run the dev server**: `npm run dev`
2. **Navigate to `/admin`** — should show Contacts and Tags tabs
3. **Tags tab**: create a category "Interest Level" with color green, add tags "interested", "decided", "uninterested". Create category "Trip" with color blue, add tags "Azores July", "Maldives August"
4. **Contacts tab**: should show all contacts (derived from imported applications). Filter by program, search by name. Verify program badges show correctly.
5. **Click a contact**: should show their applications expanded (or collapsible if multiple). Sidebar should show tags grouped by category. Assign tags, add notes.
6. **Filter by tags**: go back to contacts tab, select "decided" + "Azores July" — should filter to contacts that have BOTH tags.
7. **Realtime**: Open two browser tabs. Assign a tag in one tab, verify it appears in the other.
8. **Build check**: `npm run build` — should compile without errors.
