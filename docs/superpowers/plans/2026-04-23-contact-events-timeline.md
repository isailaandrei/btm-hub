# Contact Events Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing per-contact admin notes with a polymorphic event timeline (notes + calls + meetings + messages + info-requested + awaiting-btm-response + mentor-assigned + custom), and surface "last activity" + pending state on the contacts list.

**Architecture:** One new `contact_events` table holds all event types. Existing `contact_notes` rows are backfilled into it (type='note') and the source table stays frozen in place until a deliberate follow-up PR drops it. The contact detail page restructures: Applications and the new Timeline stack in the left column; AI Analyst becomes a full-width strip under both columns. The contacts list gets one new "Last activity" column and a single multi-select "Pending" filter ("Awaiting applicant" / "We owe response"). Realtime mirrors the existing pattern (add table to supabase_realtime publication; contact detail page subscribes and debounce-refreshes).

**Tech Stack:** Next.js App Router + Supabase Postgres + Supabase Realtime + Zod v4 + Vitest (node env). Existing patterns from `src/lib/data/contacts.ts`, `src/app/(dashboard)/admin/contacts/actions.ts`, and `src/app/(dashboard)/admin/contacts/[id]/contact-detail-realtime-refresh.tsx`.

Spec: `docs/superpowers/specs/2026-04-23-contact-events-timeline-design.md`

---

## File Structure

### New files

- `supabase/migrations/20260423000001_contact_events.sql` — enum, table, indexes, RLS, realtime, backfill, assertion.
- `src/lib/data/contact-events.ts` — server-side query/mutation functions (admin-only). Pattern mirrors `src/lib/data/contacts.ts`.
- `src/app/(dashboard)/admin/contacts/[id]/event-actions.ts` — server actions: create, update, delete, resolve, unresolve. Pattern mirrors the existing `../actions.ts`.
- `src/app/(dashboard)/admin/contacts/[id]/event-actions.test.ts` — unit tests for validation (future happened_at, custom_label requirement, resolvable-only resolved_at).
- `src/app/(dashboard)/admin/contacts/[id]/timeline.tsx` — client component. Fetches events, renders composer + rows, handles inline edit/resolve/delete.
- `src/app/(dashboard)/admin/contacts/[id]/timeline-composer.tsx` — client component. Chip picker + textarea + datetime-local + custom_label field.
- `src/app/(dashboard)/admin/contacts/[id]/timeline-event-row.tsx` — client component. One event's row including resolve bar.
- `src/app/(dashboard)/admin/contacts/[id]/event-types.ts` — pure module. Type-label map, icon map, required-body flag per type, chip order.
- `src/app/(dashboard)/admin/contacts/events-derivation.ts` — pure module. Given `contact_events[]` + optional latest application, returns `{ last_activity_at, last_activity_label, awaiting_applicant, awaiting_btm }`.
- `src/app/(dashboard)/admin/contacts/events-derivation.test.ts` — unit tests for derivation.
- `src/app/(dashboard)/admin/contacts/last-activity-cell.tsx` — client component. Renders dot + label + relative time in a contacts list row.
- `src/app/(dashboard)/admin/contacts/pending-filter.tsx` — client component. Single popover with "Awaiting applicant" / "We owe response" multi-select.

### Modified files

- `src/types/database.ts` — add `ContactEventType` enum union + `ContactEvent` interface.
- `src/app/(dashboard)/admin/contacts/[id]/page.tsx` — swap the right-column "Admin Notes" card for the new Timeline in the left column; move AI Analyst out of the left column into a full-width strip.
- `src/app/(dashboard)/admin/contacts/[id]/contact-detail-realtime-refresh.tsx` — subscribe to `contact_events` (add new channel). Remove the `contact_notes` channel since notes are now events.
- `src/app/(dashboard)/admin/contacts/[id]/contact-note-form.tsx` — **delete** (replaced by timeline composer).
- `src/app/(dashboard)/admin/contacts/actions.ts` — delete `addNote`, `submitContactNote`, and `ContactNoteFormState` (moved/replaced by event actions). Keep everything else.
- `src/app/(dashboard)/admin/contacts/actions.test.ts` — drop `submitContactNote` tests; the remaining tests stay.
- `src/lib/data/contacts.ts` — delete `getContactNotes` and `addContactNote`. Delete `ContactNote` import line.
- `src/app/(dashboard)/admin/admin-data-provider.tsx` — add `contactEvents` to the contacts context. Fetch alongside contacts; subscribe via realtime; expose `ContactEvent[]` consumers.
- `src/app/(dashboard)/admin/contacts/contacts-panel-view-model.ts` — accept `contactEvents` arg; compute derived state per row; expose it through `paginatedRows`.
- `src/app/(dashboard)/admin/contacts/contacts-panel-state.ts` — add `pending` filter state + persistence key.
- `src/app/(dashboard)/admin/contacts/contacts-filters.tsx` — add `<PendingFilter>` to the filter bar.
- `src/app/(dashboard)/admin/contacts/field-registry.ts` — add virtual field entry for `last_activity` (type `text`, no canonical, no options) so the column picker can surface it.
- `src/app/(dashboard)/admin/contacts/contacts-panel.tsx` — render the `<LastActivityCell>` when the `last_activity` column is visible; plumb `contactEvents` from context.

### Deliberately untouched

- RLS policies for `contact_notes` (table stays in place until a separate follow-up PR).
- The existing contacts detail three-card right sidebar structure except for removing the Notes card.
- The existing column-filter-popover infrastructure — the new Pending filter uses its own component rather than shoehorning into the tag-category popover (clearer ownership).

---

## Pre-flight

### Task 0: Install dependencies and establish clean baseline

**Files:** none (working-directory prep)

- [ ] **Step 0.1: Install dependencies**

```bash
cd .worktrees/contact-timeline
npm install
```

Expected: install completes without errors. Takes a few minutes.

- [ ] **Step 0.2: Run the test suite on the baseline**

```bash
npm test -- --run
```

Expected: all existing tests pass (this is off `main`, so they must). If any fail, stop and surface the failures — do not proceed.

- [ ] **Step 0.3: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors. If errors exist on `main`, stop and surface — do not proceed with a broken baseline.

---

## Phase A — Database migration

### Task 1: Create the `contact_events` migration

**Files:**
- Create: `supabase/migrations/20260423000001_contact_events.sql`

- [ ] **Step 1.1: Write the migration SQL**

```sql
-- Migration: contact_events — per-contact event timeline
-- Additive + backfill of contact_notes → contact_events (type='note').
-- Aborts if backfill row count does not match source.

-- 1. Enum for event types
CREATE TYPE contact_event_type AS ENUM (
  'note',
  'call',
  'in_person_meeting',
  'message',
  'info_requested',
  'awaiting_btm_response',
  'mentor_assigned',
  'custom'
);

-- 2. Main table
CREATE TABLE contact_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type          contact_event_type NOT NULL,
  custom_label  text,
  body          text NOT NULL DEFAULT '' CHECK (char_length(body) <= 5000),
  happened_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  author_id     uuid NOT NULL REFERENCES auth.users(id),
  author_name   text NOT NULL,
  edited_at     timestamptz,
  resolved_at   timestamptz,
  resolved_by   uuid REFERENCES auth.users(id),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (
    type <> 'custom'
    OR (custom_label IS NOT NULL AND char_length(custom_label) > 0 AND char_length(custom_label) <= 80)
  ),
  CHECK (type IN ('info_requested', 'awaiting_btm_response') OR resolved_at IS NULL),
  CHECK (resolved_at IS NULL OR resolved_by IS NOT NULL)
);

-- 3. Indexes
CREATE INDEX idx_contact_events_contact_happened
  ON contact_events (contact_id, happened_at DESC);

CREATE INDEX idx_contact_events_open_pending
  ON contact_events (contact_id, type)
  WHERE resolved_at IS NULL
    AND type IN ('info_requested', 'awaiting_btm_response');

-- 4. RLS — admin-only, mirrors contact_notes pattern
ALTER TABLE contact_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read contact_events" ON contact_events
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can insert contact_events" ON contact_events
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can update contact_events" ON contact_events
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can delete contact_events" ON contact_events
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE contact_events;
ALTER TABLE contact_events REPLICA IDENTITY FULL;

-- 6. Backfill existing notes as type='note' events
INSERT INTO contact_events
  (id, contact_id, type, body, happened_at, created_at, updated_at,
   author_id, author_name)
SELECT
  id,
  contact_id,
  'note'::contact_event_type,
  text,
  created_at,    -- happened_at = created_at (no backdating info for old notes)
  created_at,
  created_at,    -- contact_notes has no updated_at; seed with created_at
  author_id,
  author_name
FROM contact_notes;

-- 7. Hard assertion: row counts must match
DO $$
DECLARE
  src_count bigint;
  dst_count bigint;
BEGIN
  SELECT count(*) INTO src_count FROM contact_notes;
  SELECT count(*) INTO dst_count FROM contact_events WHERE type = 'note';
  IF src_count <> dst_count THEN
    RAISE EXCEPTION 'contact_events backfill mismatch: contact_notes=% contact_events(note)=%',
      src_count, dst_count;
  END IF;
END $$;
```

- [ ] **Step 1.2: Apply the migration locally**

The project's hook automatically runs `supabase db push --local` after migration files change. If that doesn't trigger, run it manually:

```bash
supabase db push --local
```

Expected: migration applies cleanly, no errors. If the `DO $$ … $$` assertion fails, you'll see `contact_events backfill mismatch: …` — this is the intended failure mode.

- [ ] **Step 1.3: Verify the table and backfill by hand**

```bash
supabase db psql --local -c "SELECT count(*) AS notes FROM contact_notes; SELECT count(*) AS events_notes FROM contact_events WHERE type = 'note'; SELECT count(*) AS events_total FROM contact_events;"
```

Expected: `notes` equals `events_notes`; `events_total` equals `events_notes` (no non-note events yet).

- [ ] **Step 1.4: Commit**

```bash
git add supabase/migrations/20260423000001_contact_events.sql
git commit -m "feat(db): add contact_events with backfill from contact_notes

Creates the contact_event_type enum and contact_events table
with partial index for open pending events. Backfills existing
contact_notes as type='note' with a DO block assertion that
aborts the migration if row counts diverge."
```

---

## Phase B — Types and data layer

### Task 2: Add `ContactEvent` type

**Files:**
- Modify: `src/types/database.ts` — add after `ContactNote` (around line 90)

- [ ] **Step 2.1: Add the type definitions**

Insert this block immediately after the `ContactNote` interface (line 90) in `src/types/database.ts`:

```typescript
export type ContactEventType =
  | "note"
  | "call"
  | "in_person_meeting"
  | "message"
  | "info_requested"
  | "awaiting_btm_response"
  | "mentor_assigned"
  | "custom";

export interface ContactEvent {
  id: string;
  contact_id: string;
  type: ContactEventType;
  custom_label: string | null;
  body: string;
  happened_at: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  author_name: string;
  edited_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  metadata: Record<string, unknown>;
}
```

- [ ] **Step 2.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2.3: Commit**

```bash
git add src/types/database.ts
git commit -m "types: add ContactEvent and ContactEventType"
```

### Task 3: Add server-side data layer

**Files:**
- Create: `src/lib/data/contact-events.ts`

- [ ] **Step 3.1: Create the data layer module**

Write `src/lib/data/contact-events.ts`:

```typescript
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { ContactEvent, ContactEventType } from "@/types/database";

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const getContactEvents = cache(async function getContactEvents(
  contactId: string,
): Promise<ContactEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_events")
    .select("*")
    .eq("contact_id", contactId)
    .order("happened_at", { ascending: false });

  if (error) throw new Error(`Failed to load contact events: ${error.message}`);
  return (data ?? []) as ContactEvent[];
});

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface CreateContactEventInput {
  contactId: string;
  type: ContactEventType;
  customLabel: string | null;
  body: string;
  happenedAt: string;
  authorId: string;
  authorName: string;
}

export async function createContactEvent(input: CreateContactEventInput) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_events")
    .insert({
      contact_id: input.contactId,
      type: input.type,
      custom_label: input.customLabel,
      body: input.body,
      happened_at: input.happenedAt,
      author_id: input.authorId,
      author_name: input.authorName,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create contact event: ${error.message}`);
  return data as ContactEvent;
}

export interface UpdateContactEventInput {
  body?: string;
  customLabel?: string | null;
  happenedAt?: string;
}

export async function updateContactEvent(
  eventId: string,
  fields: UpdateContactEventInput,
) {
  await requireAdmin();
  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    edited_at: new Date().toISOString(),
  };
  if (fields.body !== undefined) patch.body = fields.body;
  if (fields.customLabel !== undefined) patch.custom_label = fields.customLabel;
  if (fields.happenedAt !== undefined) patch.happened_at = fields.happenedAt;

  const { data, error } = await supabase
    .from("contact_events")
    .update(patch)
    .eq("id", eventId)
    .select("id, contact_id")
    .maybeSingle();

  if (error) throw new Error(`Failed to update contact event: ${error.message}`);
  if (!data) throw new Error("Contact event not found");
  return data as { id: string; contact_id: string };
}

export async function deleteContactEvent(eventId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_events")
    .delete()
    .eq("id", eventId)
    .select("id, contact_id")
    .maybeSingle();

  if (error) throw new Error(`Failed to delete contact event: ${error.message}`);
  if (!data) throw new Error("Contact event not found");
  return data as { id: string; contact_id: string };
}

export async function resolveContactEvent(eventId: string, resolverId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_events")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: resolverId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .in("type", ["info_requested", "awaiting_btm_response"])
    .select("id, contact_id")
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve contact event: ${error.message}`);
  if (!data) throw new Error("Contact event not found or not resolvable");
  return data as { id: string; contact_id: string };
}

export async function unresolveContactEvent(eventId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_events")
    .update({
      resolved_at: null,
      resolved_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .select("id, contact_id")
    .maybeSingle();

  if (error) throw new Error(`Failed to reopen contact event: ${error.message}`);
  if (!data) throw new Error("Contact event not found");
  return data as { id: string; contact_id: string };
}

// ---------------------------------------------------------------------------
// Contacts-list enrichment (all events, all contacts)
// ---------------------------------------------------------------------------

/**
 * Lightweight projection for the contacts list. Fields are chosen so the
 * client-side derivation in `events-derivation.ts` can compute last_activity
 * and pending flags without pulling bodies.
 */
export interface ContactEventSummary {
  contact_id: string;
  type: ContactEventType;
  custom_label: string | null;
  happened_at: string;
  resolved_at: string | null;
}

export const getAllContactEventSummaries = cache(
  async function getAllContactEventSummaries(): Promise<ContactEventSummary[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contact_events")
      .select("contact_id, type, custom_label, happened_at, resolved_at");

    if (error) throw new Error(`Failed to load contact event summaries: ${error.message}`);
    return (data ?? []) as ContactEventSummary[];
  },
);
```

- [ ] **Step 3.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3.3: Commit**

```bash
git add src/lib/data/contact-events.ts
git commit -m "feat(data): add contact-events query and mutation functions"
```

---

## Phase C — Event types module

### Task 4: Define the event-types metadata module

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/[id]/event-types.ts`

- [ ] **Step 4.1: Create the module**

Write `src/app/(dashboard)/admin/contacts/[id]/event-types.ts`:

```typescript
import type { ContactEventType } from "@/types/database";

export interface EventTypeMeta {
  value: ContactEventType;
  label: string;
  bodyRequired: boolean;
  resolvable: boolean;
}

export const EVENT_TYPE_ORDER: ContactEventType[] = [
  "note",
  "call",
  "in_person_meeting",
  "message",
  "info_requested",
  "awaiting_btm_response",
  "mentor_assigned",
  "custom",
];

export const EVENT_TYPE_META: Record<ContactEventType, EventTypeMeta> = {
  note: { value: "note", label: "Note", bodyRequired: true, resolvable: false },
  call: { value: "call", label: "Call", bodyRequired: false, resolvable: false },
  in_person_meeting: {
    value: "in_person_meeting",
    label: "In-person meeting",
    bodyRequired: false,
    resolvable: false,
  },
  message: { value: "message", label: "Message", bodyRequired: false, resolvable: false },
  info_requested: {
    value: "info_requested",
    label: "Info requested",
    bodyRequired: true,
    resolvable: true,
  },
  awaiting_btm_response: {
    value: "awaiting_btm_response",
    label: "Waiting for BTM response",
    bodyRequired: true,
    resolvable: true,
  },
  mentor_assigned: {
    value: "mentor_assigned",
    label: "Mentor assigned",
    bodyRequired: true,
    resolvable: false,
  },
  custom: { value: "custom", label: "Custom", bodyRequired: false, resolvable: false },
};

export function eventTypeLabel(type: ContactEventType, customLabel: string | null): string {
  if (type === "custom") return customLabel ?? "Custom";
  return EVENT_TYPE_META[type].label;
}

export function isResolvable(type: ContactEventType): boolean {
  return EVENT_TYPE_META[type].resolvable;
}

export function bodyRequiredFor(type: ContactEventType): boolean {
  return EVENT_TYPE_META[type].bodyRequired;
}
```

- [ ] **Step 4.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4.3: Commit**

```bash
git add 'src/app/(dashboard)/admin/contacts/[id]/event-types.ts'
git commit -m "feat(admin): add event-types metadata module"
```

---

## Phase D — Server actions

### Task 5: Write server actions (TDD: test first)

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/[id]/event-actions.test.ts`
- Create: `src/app/(dashboard)/admin/contacts/[id]/event-actions.ts`

- [ ] **Step 5.1: Write the failing tests**

Create `src/app/(dashboard)/admin/contacts/[id]/event-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Profile } from "@/types/database";

const mockProfile: Profile = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "admin@test.com",
  display_name: "Admin",
  bio: null,
  avatar_url: null,
  role: "admin",
  preferences: {},
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue(mockProfile),
}));

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockResolve = vi.fn();
const mockUnresolve = vi.fn();

vi.mock("@/lib/data/contact-events", () => ({
  createContactEvent: mockCreate,
  updateContactEvent: mockUpdate,
  deleteContactEvent: mockDelete,
  resolveContactEvent: mockResolve,
  unresolveContactEvent: mockUnresolve,
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

const {
  createEvent,
  updateEvent,
  deleteEvent,
  resolveEvent,
  unresolveEvent,
} = await import("./event-actions");

const VALID_CONTACT = "550e8400-e29b-41d4-a716-446655440001";
const VALID_EVENT = "550e8400-e29b-41d4-a716-446655440002";

describe("createEvent", () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({
      id: VALID_EVENT,
      contact_id: VALID_CONTACT,
    });
  });

  it("creates a note event with body", async () => {
    await createEvent({
      contactId: VALID_CONTACT,
      type: "note",
      body: "Test note",
      happenedAt: "2026-04-22T14:30:00.000Z",
      customLabel: null,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: VALID_CONTACT,
        type: "note",
        body: "Test note",
      }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/contacts/${VALID_CONTACT}`,
    );
  });

  it("rejects invalid contact UUID", async () => {
    await expect(
      createEvent({
        contactId: "not-a-uuid",
        type: "note",
        body: "Test",
        happenedAt: "2026-04-22T14:30:00.000Z",
        customLabel: null,
      }),
    ).rejects.toThrow();
  });

  it("rejects future happenedAt more than 1 minute ahead", async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await expect(
      createEvent({
        contactId: VALID_CONTACT,
        type: "note",
        body: "Test",
        happenedAt: future,
        customLabel: null,
      }),
    ).rejects.toThrow(/future/i);
  });

  it("accepts happenedAt within 1 minute skew tolerance", async () => {
    const nearFuture = new Date(Date.now() + 30 * 1000).toISOString();
    await createEvent({
      contactId: VALID_CONTACT,
      type: "note",
      body: "Test",
      happenedAt: nearFuture,
      customLabel: null,
    });
    expect(mockCreate).toHaveBeenCalled();
  });

  it("requires body for note", async () => {
    await expect(
      createEvent({
        contactId: VALID_CONTACT,
        type: "note",
        body: "",
        happenedAt: "2026-04-22T14:30:00.000Z",
        customLabel: null,
      }),
    ).rejects.toThrow(/body/i);
  });

  it("allows empty body for call", async () => {
    await createEvent({
      contactId: VALID_CONTACT,
      type: "call",
      body: "",
      happenedAt: "2026-04-22T14:30:00.000Z",
      customLabel: null,
    });
    expect(mockCreate).toHaveBeenCalled();
  });

  it("requires custom_label for type=custom", async () => {
    await expect(
      createEvent({
        contactId: VALID_CONTACT,
        type: "custom",
        body: "Body",
        happenedAt: "2026-04-22T14:30:00.000Z",
        customLabel: null,
      }),
    ).rejects.toThrow(/label/i);
  });

  it("rejects custom_label longer than 80 chars", async () => {
    await expect(
      createEvent({
        contactId: VALID_CONTACT,
        type: "custom",
        body: "Body",
        happenedAt: "2026-04-22T14:30:00.000Z",
        customLabel: "x".repeat(81),
      }),
    ).rejects.toThrow(/80/);
  });

  it("rejects body longer than 5000 chars", async () => {
    await expect(
      createEvent({
        contactId: VALID_CONTACT,
        type: "note",
        body: "x".repeat(5001),
        happenedAt: "2026-04-22T14:30:00.000Z",
        customLabel: null,
      }),
    ).rejects.toThrow(/5000/);
  });

  it("snapshots author from requireAdmin", async () => {
    await createEvent({
      contactId: VALID_CONTACT,
      type: "note",
      body: "Test",
      happenedAt: "2026-04-22T14:30:00.000Z",
      customLabel: null,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: mockProfile.id,
        authorName: mockProfile.display_name,
      }),
    );
  });
});

describe("resolveEvent", () => {
  beforeEach(() => {
    mockResolve.mockResolvedValue({ id: VALID_EVENT, contact_id: VALID_CONTACT });
  });

  it("resolves a resolvable event and revalidates contact path", async () => {
    await resolveEvent(VALID_EVENT);
    expect(mockResolve).toHaveBeenCalledWith(VALID_EVENT, mockProfile.id);
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/contacts/${VALID_CONTACT}`,
    );
  });

  it("rejects invalid UUID", async () => {
    await expect(resolveEvent("not-uuid")).rejects.toThrow();
  });
});

describe("unresolveEvent", () => {
  beforeEach(() => {
    mockUnresolve.mockResolvedValue({ id: VALID_EVENT, contact_id: VALID_CONTACT });
  });

  it("unresolves an event and revalidates contact path", async () => {
    await unresolveEvent(VALID_EVENT);
    expect(mockUnresolve).toHaveBeenCalledWith(VALID_EVENT);
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/contacts/${VALID_CONTACT}`,
    );
  });
});

describe("updateEvent", () => {
  beforeEach(() => {
    mockUpdate.mockResolvedValue({ id: VALID_EVENT, contact_id: VALID_CONTACT });
  });

  it("updates body", async () => {
    await updateEvent(VALID_EVENT, { body: "New body" });
    expect(mockUpdate).toHaveBeenCalledWith(VALID_EVENT, { body: "New body" });
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/contacts/${VALID_CONTACT}`,
    );
  });

  it("rejects body over 5000 chars", async () => {
    await expect(
      updateEvent(VALID_EVENT, { body: "x".repeat(5001) }),
    ).rejects.toThrow(/5000/);
  });

  it("rejects future happenedAt beyond skew tolerance", async () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await expect(
      updateEvent(VALID_EVENT, { happenedAt: future }),
    ).rejects.toThrow(/future/i);
  });
});

describe("deleteEvent", () => {
  beforeEach(() => {
    mockDelete.mockResolvedValue({ id: VALID_EVENT, contact_id: VALID_CONTACT });
  });

  it("deletes and revalidates contact path", async () => {
    await deleteEvent(VALID_EVENT);
    expect(mockDelete).toHaveBeenCalledWith(VALID_EVENT);
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/contacts/${VALID_CONTACT}`,
    );
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

```bash
npm test -- event-actions
```

Expected: all tests FAIL with "Cannot find module './event-actions'" (or similar import error). This is the intended starting state.

- [ ] **Step 5.3: Write the server actions**

Create `src/app/(dashboard)/admin/contacts/[id]/event-actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateUUID } from "@/lib/validation-helpers";
import {
  createContactEvent,
  updateContactEvent,
  deleteContactEvent,
  resolveContactEvent,
  unresolveContactEvent,
} from "@/lib/data/contact-events";
import type { ContactEventType } from "@/types/database";
import { bodyRequiredFor } from "./event-types";

const FUTURE_SKEW_MS = 60 * 1000; // 1 minute

const eventTypeEnum = z.enum([
  "note",
  "call",
  "in_person_meeting",
  "message",
  "info_requested",
  "awaiting_btm_response",
  "mentor_assigned",
  "custom",
]);

const createSchema = z
  .object({
    type: eventTypeEnum,
    body: z.string().max(5000, "Body must be 5000 characters or fewer"),
    customLabel: z
      .string()
      .trim()
      .max(80, "Custom label must be 80 characters or fewer")
      .nullable(),
    happenedAt: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "custom") {
      if (!data.customLabel || data.customLabel.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Custom label is required for custom events",
          path: ["customLabel"],
        });
      }
    }
    if (bodyRequiredFor(data.type) && data.body.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Body is required for this event type",
        path: ["body"],
      });
    }
    const happenedAt = new Date(data.happenedAt).getTime();
    if (!Number.isFinite(happenedAt)) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid happenedAt date",
        path: ["happenedAt"],
      });
      return;
    }
    if (happenedAt > Date.now() + FUTURE_SKEW_MS) {
      ctx.addIssue({
        code: "custom",
        message: "happenedAt cannot be in the future",
        path: ["happenedAt"],
      });
    }
  });

export type CreateEventArgs = {
  contactId: string;
  type: ContactEventType;
  body: string;
  customLabel: string | null;
  happenedAt: string;
};

export async function createEvent(args: CreateEventArgs) {
  validateUUID(args.contactId, "contact");
  const parsed = createSchema.safeParse(args);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(first?.message ?? "Invalid event data");
  }
  const profile = await requireAdmin();
  const created = await createContactEvent({
    contactId: args.contactId,
    type: parsed.data.type,
    body: parsed.data.body,
    customLabel: parsed.data.type === "custom" ? parsed.data.customLabel : null,
    happenedAt: parsed.data.happenedAt,
    authorId: profile.id,
    authorName: profile.display_name ?? profile.email,
  });
  revalidatePath(`/admin/contacts/${args.contactId}`);
  revalidatePath("/admin");
  return created;
}

const updateSchema = z
  .object({
    body: z
      .string()
      .max(5000, "Body must be 5000 characters or fewer")
      .optional(),
    customLabel: z
      .string()
      .trim()
      .max(80, "Custom label must be 80 characters or fewer")
      .nullable()
      .optional(),
    happenedAt: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.happenedAt !== undefined) {
      const t = new Date(data.happenedAt).getTime();
      if (!Number.isFinite(t)) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid happenedAt date",
          path: ["happenedAt"],
        });
        return;
      }
      if (t > Date.now() + FUTURE_SKEW_MS) {
        ctx.addIssue({
          code: "custom",
          message: "happenedAt cannot be in the future",
          path: ["happenedAt"],
        });
      }
    }
  });

export async function updateEvent(
  eventId: string,
  fields: { body?: string; customLabel?: string | null; happenedAt?: string },
) {
  validateUUID(eventId, "event");
  const parsed = updateSchema.safeParse(fields);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(first?.message ?? "Invalid event update");
  }
  const updated = await updateContactEvent(eventId, parsed.data);
  revalidatePath(`/admin/contacts/${updated.contact_id}`);
  revalidatePath("/admin");
  return updated;
}

export async function deleteEvent(eventId: string) {
  validateUUID(eventId, "event");
  const deleted = await deleteContactEvent(eventId);
  revalidatePath(`/admin/contacts/${deleted.contact_id}`);
  revalidatePath("/admin");
  return deleted;
}

export async function resolveEvent(eventId: string) {
  validateUUID(eventId, "event");
  const profile = await requireAdmin();
  const result = await resolveContactEvent(eventId, profile.id);
  revalidatePath(`/admin/contacts/${result.contact_id}`);
  revalidatePath("/admin");
  return result;
}

export async function unresolveEvent(eventId: string) {
  validateUUID(eventId, "event");
  const result = await unresolveContactEvent(eventId);
  revalidatePath(`/admin/contacts/${result.contact_id}`);
  revalidatePath("/admin");
  return result;
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

```bash
npm test -- event-actions
```

Expected: all tests PASS.

- [ ] **Step 5.5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5.6: Commit**

```bash
git add 'src/app/(dashboard)/admin/contacts/[id]/event-actions.ts' 'src/app/(dashboard)/admin/contacts/[id]/event-actions.test.ts'
git commit -m "feat(admin): add contact-event server actions with validation

Covers create/update/delete plus resolve/unresolve for
info_requested and awaiting_btm_response. Validates future
happened_at, required body per type, and custom_label length."
```

---

## Phase E — Derivation module and unit tests

### Task 6: Write the events-derivation module (TDD)

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/events-derivation.test.ts`
- Create: `src/app/(dashboard)/admin/contacts/events-derivation.ts`

- [ ] **Step 6.1: Write the failing tests**

Create `src/app/(dashboard)/admin/contacts/events-derivation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { ContactEventSummary } from "@/lib/data/contact-events";
import type { Application } from "@/types/database";
import { deriveContactActivity } from "./events-derivation";

function event(partial: Partial<ContactEventSummary>): ContactEventSummary {
  return {
    contact_id: "contact-1",
    type: "note",
    custom_label: null,
    happened_at: "2026-04-22T10:00:00.000Z",
    resolved_at: null,
    ...partial,
  };
}

function application(submittedAt: string): Pick<Application, "submitted_at"> {
  return { submitted_at: submittedAt };
}

describe("deriveContactActivity", () => {
  it("returns empty state when there are neither events nor applications", () => {
    const result = deriveContactActivity([], []);
    expect(result).toEqual({
      last_activity_at: null,
      last_activity_label: null,
      awaiting_applicant: false,
      awaiting_btm: false,
    });
  });

  it("falls back to Application submitted when no events", () => {
    const apps = [application("2026-04-01T10:00:00.000Z")];
    const result = deriveContactActivity([], apps);
    expect(result).toEqual({
      last_activity_at: "2026-04-01T10:00:00.000Z",
      last_activity_label: "Application submitted",
      awaiting_applicant: false,
      awaiting_btm: false,
    });
  });

  it("uses the most recent application when multiple exist", () => {
    const apps = [
      application("2026-04-01T10:00:00.000Z"),
      application("2026-04-10T10:00:00.000Z"),
    ];
    const result = deriveContactActivity([], apps);
    expect(result.last_activity_at).toBe("2026-04-10T10:00:00.000Z");
  });

  it("prefers newest event over application submission", () => {
    const events = [event({ happened_at: "2026-04-20T10:00:00.000Z", type: "call" })];
    const apps = [application("2026-04-01T10:00:00.000Z")];
    const result = deriveContactActivity(events, apps);
    expect(result.last_activity_at).toBe("2026-04-20T10:00:00.000Z");
    expect(result.last_activity_label).toBe("Call");
  });

  it("labels custom events with their custom_label", () => {
    const events = [
      event({
        type: "custom",
        custom_label: "Intro with family",
        happened_at: "2026-04-20T10:00:00.000Z",
      }),
    ];
    const result = deriveContactActivity(events, []);
    expect(result.last_activity_label).toBe("Intro with family");
  });

  it("flags awaiting_applicant when info_requested is unresolved", () => {
    const events = [event({ type: "info_requested", resolved_at: null })];
    const result = deriveContactActivity(events, []);
    expect(result.awaiting_applicant).toBe(true);
    expect(result.awaiting_btm).toBe(false);
  });

  it("does not flag awaiting_applicant when info_requested is resolved", () => {
    const events = [
      event({
        type: "info_requested",
        resolved_at: "2026-04-21T10:00:00.000Z",
      }),
    ];
    const result = deriveContactActivity(events, []);
    expect(result.awaiting_applicant).toBe(false);
  });

  it("flags awaiting_btm when awaiting_btm_response is unresolved", () => {
    const events = [event({ type: "awaiting_btm_response", resolved_at: null })];
    const result = deriveContactActivity(events, []);
    expect(result.awaiting_btm).toBe(true);
  });

  it("flags both when both pending types are open", () => {
    const events = [
      event({ type: "info_requested", resolved_at: null }),
      event({ type: "awaiting_btm_response", resolved_at: null }),
    ];
    const result = deriveContactActivity(events, []);
    expect(result.awaiting_applicant).toBe(true);
    expect(result.awaiting_btm).toBe(true);
  });

  it("selects the label from the newest event, not the newest pending event", () => {
    const events = [
      event({
        type: "info_requested",
        resolved_at: null,
        happened_at: "2026-04-10T10:00:00.000Z",
      }),
      event({
        type: "note",
        happened_at: "2026-04-20T10:00:00.000Z",
      }),
    ];
    const result = deriveContactActivity(events, []);
    expect(result.last_activity_label).toBe("Note");
    expect(result.awaiting_applicant).toBe(true);
  });
});
```

- [ ] **Step 6.2: Run tests to verify they fail**

```bash
npm test -- events-derivation
```

Expected: FAIL — module does not exist yet.

- [ ] **Step 6.3: Write the derivation module**

Create `src/app/(dashboard)/admin/contacts/events-derivation.ts`:

```typescript
import type { Application } from "@/types/database";
import type { ContactEventSummary } from "@/lib/data/contact-events";
import { eventTypeLabel } from "./[id]/event-types";

export interface ContactActivityDerivation {
  last_activity_at: string | null;
  last_activity_label: string | null;
  awaiting_applicant: boolean;
  awaiting_btm: boolean;
}

export function deriveContactActivity(
  events: ContactEventSummary[],
  applications: Pick<Application, "submitted_at">[],
): ContactActivityDerivation {
  let newestEvent: ContactEventSummary | null = null;
  let awaiting_applicant = false;
  let awaiting_btm = false;

  for (const event of events) {
    if (!newestEvent || event.happened_at > newestEvent.happened_at) {
      newestEvent = event;
    }
    if (event.resolved_at === null) {
      if (event.type === "info_requested") awaiting_applicant = true;
      if (event.type === "awaiting_btm_response") awaiting_btm = true;
    }
  }

  if (newestEvent) {
    return {
      last_activity_at: newestEvent.happened_at,
      last_activity_label: eventTypeLabel(newestEvent.type, newestEvent.custom_label),
      awaiting_applicant,
      awaiting_btm,
    };
  }

  let newestApp: string | null = null;
  for (const app of applications) {
    if (!newestApp || app.submitted_at > newestApp) {
      newestApp = app.submitted_at;
    }
  }
  if (newestApp) {
    return {
      last_activity_at: newestApp,
      last_activity_label: "Application submitted",
      awaiting_applicant,
      awaiting_btm,
    };
  }

  return {
    last_activity_at: null,
    last_activity_label: null,
    awaiting_applicant,
    awaiting_btm,
  };
}
```

- [ ] **Step 6.4: Run tests to verify they pass**

```bash
npm test -- events-derivation
```

Expected: all tests PASS.

- [ ] **Step 6.5: Commit**

```bash
git add 'src/app/(dashboard)/admin/contacts/events-derivation.ts' 'src/app/(dashboard)/admin/contacts/events-derivation.test.ts'
git commit -m "feat(admin): derive last-activity and pending flags from events"
```

---

## Phase F — Timeline UI

Timeline UI is three components that work together:
- `timeline-event-row.tsx` — renders one event, handles its own edit/delete/resolve flows.
- `timeline-composer.tsx` — the "Add event" form.
- `timeline.tsx` — the card-level container that owns the events array, pulls fresh data, and composes the two above.

We do not write RTL component tests (the project's convention is pure-logic tests). The unit coverage for validation lives in Task 5; derivation coverage lives in Task 6. Visual behavior is verified manually during Task 11.

### Task 7: Event row component

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/[id]/timeline-event-row.tsx`

- [ ] **Step 7.1: Write the component**

Create `src/app/(dashboard)/admin/contacts/[id]/timeline-event-row.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import type { ContactEvent } from "@/types/database";
import { eventTypeLabel, isResolvable } from "./event-types";
import { updateEvent, deleteEvent, resolveEvent, unresolveEvent } from "./event-actions";

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(abs / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(abs / 86_400_000);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface TimelineEventRowProps {
  event: ContactEvent;
}

export function TimelineEventRow({ event }: TimelineEventRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftBody, setDraftBody] = useState(event.body);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const label = eventTypeLabel(event.type, event.custom_label);
  const isOpen = isResolvable(event.type) && event.resolved_at === null;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateEvent(event.id, { body: draftBody });
        setIsEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  function handleDelete() {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteEvent(event.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete");
      }
    });
  }

  function handleResolve() {
    setError(null);
    startTransition(async () => {
      try {
        await resolveEvent(event.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resolve");
      }
    });
  }

  function handleReopen() {
    setError(null);
    startTransition(async () => {
      try {
        await unresolveEvent(event.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reopen");
      }
    });
  }

  return (
    <div
      className={`flex gap-3 border-t border-border py-3 first:border-t-0 ${
        isOpen ? "border-l-2 border-l-amber-500 pl-3" : ""
      }`}
    >
      <div
        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-medium ${
          isOpen ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground"
        }`}
        aria-hidden
      >
        {label.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">
            {event.author_name} &middot; {formatRelative(event.happened_at)} &middot;{" "}
            {formatAbsolute(event.happened_at)}
            {event.edited_at && (
              <> &middot; edited {formatRelative(event.edited_at)}</>
            )}
          </span>
        </div>
        {isEditing ? (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              maxLength={5000}
              rows={3}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
              disabled={isPending}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="rounded bg-primary px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftBody(event.body);
                  setIsEditing(false);
                }}
                className="rounded border border-border px-3 py-1 text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          event.body && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
              {event.body}
            </p>
          )
        )}

        {isOpen && !isEditing && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
            <span>Awaiting response</span>
            <button
              type="button"
              onClick={handleResolve}
              disabled={isPending}
              className="ml-auto rounded bg-amber-700 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Mark resolved
            </button>
          </div>
        )}

        <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
          {!isEditing && (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-primary hover:underline"
              >
                Edit
              </button>
              <span>&middot;</span>
              <button
                type="button"
                onClick={handleDelete}
                className="text-primary hover:underline"
              >
                Delete
              </button>
              {isResolvable(event.type) && event.resolved_at && (
                <>
                  <span>&middot;</span>
                  <button
                    type="button"
                    onClick={handleReopen}
                    className="text-primary hover:underline"
                  >
                    Reopen
                  </button>
                </>
              )}
            </>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 7.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 7.3: Commit**

```bash
git add 'src/app/(dashboard)/admin/contacts/[id]/timeline-event-row.tsx'
git commit -m "feat(admin): add timeline event row with inline edit/resolve/delete"
```

### Task 8: Timeline composer

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/[id]/timeline-composer.tsx`

- [ ] **Step 8.1: Write the component**

Create `src/app/(dashboard)/admin/contacts/[id]/timeline-composer.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import type { ContactEventType } from "@/types/database";
import {
  EVENT_TYPE_META,
  EVENT_TYPE_ORDER,
  bodyRequiredFor,
} from "./event-types";
import { createEvent } from "./event-actions";

function nowIsoLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

interface TimelineComposerProps {
  contactId: string;
}

export function TimelineComposer({ contactId }: TimelineComposerProps) {
  const [type, setType] = useState<ContactEventType>("note");
  const [body, setBody] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [happenedAt, setHappenedAt] = useState(nowIsoLocalInput());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const bodyRequired = bodyRequiredFor(type);
  const remaining = 5000 - body.length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createEvent({
          contactId,
          type,
          body,
          customLabel: type === "custom" ? customLabel.trim() : null,
          happenedAt: new Date(happenedAt).toISOString(),
        });
        setBody("");
        setCustomLabel("");
        setHappenedAt(nowIsoLocalInput());
        setType("note");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add event");
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Add event
      </p>
      <div className="flex flex-wrap gap-1.5">
        {EVENT_TYPE_ORDER.map((t) => {
          const active = t === type;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-full border px-3 py-0.5 text-xs transition-colors ${
                active
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {EVENT_TYPE_META[t].label}
            </button>
          );
        })}
      </div>

      {type === "custom" && (
        <input
          type="text"
          placeholder="Custom label (required)"
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          maxLength={80}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
          disabled={isPending}
        />
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          bodyRequired ? "What happened?" : "What happened? (optional)"
        }
        rows={3}
        maxLength={5000}
        className="resize-none rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
        disabled={isPending}
      />
      {remaining < 500 && (
        <p className="self-end text-xs text-muted-foreground">
          {remaining} chars left
        </p>
      )}

      <div className="flex items-center gap-2 text-sm">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          When
          <input
            type="datetime-local"
            value={happenedAt}
            onChange={(e) => setHappenedAt(e.target.value)}
            className="rounded border border-border bg-background px-1 py-0.5 text-xs"
            disabled={isPending}
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="ml-auto rounded bg-primary px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add to timeline"}
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 8.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 8.3: Commit**

```bash
git add 'src/app/(dashboard)/admin/contacts/[id]/timeline-composer.tsx'
git commit -m "feat(admin): add timeline composer (chip picker + body + datetime)"
```

### Task 9: Timeline container

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/[id]/timeline.tsx`

- [ ] **Step 9.1: Write the container**

Create `src/app/(dashboard)/admin/contacts/[id]/timeline.tsx`:

```typescript
import type { ContactEvent } from "@/types/database";
import { TimelineComposer } from "./timeline-composer";
import { TimelineEventRow } from "./timeline-event-row";

interface TimelineProps {
  contactId: string;
  events: ContactEvent[];
}

export function Timeline({ contactId, events }: TimelineProps) {
  return (
    <div className="flex flex-col gap-4">
      <TimelineComposer contactId={contactId} />
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No activity yet. Add the first event above.
        </p>
      ) : (
        <div className="flex flex-col">
          {events.map((event) => (
            <TimelineEventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 9.3: Commit**

```bash
git add 'src/app/(dashboard)/admin/contacts/[id]/timeline.tsx'
git commit -m "feat(admin): add timeline container composing composer and rows"
```

---

## Phase G — Contact detail page integration

### Task 10: Restructure the contact detail page

**Files:**
- Modify: `src/app/(dashboard)/admin/contacts/[id]/page.tsx`
- Modify: `src/app/(dashboard)/admin/contacts/[id]/contact-detail-realtime-refresh.tsx`

- [ ] **Step 10.1: Rewrite the page**

Replace `src/app/(dashboard)/admin/contacts/[id]/page.tsx` with:

```typescript
import Link from "next/link";
import { notFound } from "next/navigation";
import { validateUUID } from "@/lib/validation-helpers";
import {
  getContactById,
  getApplicationsByContactId,
  getContactTags,
  getTagCategories,
  getTags,
} from "@/lib/data/contacts";
import { getContactEvents } from "@/lib/data/contact-events";
import { getAdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import { listAdminAiThreadSummaries } from "@/lib/data/admin-ai";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AdminAiPanel } from "../../admin-ai/panel";
import { ApplicationCard } from "./application-card";
import { ContactTagManager } from "./contact-tag-manager";
import { ContactDetailRealtimeRefresh } from "./contact-detail-realtime-refresh";
import { Timeline } from "./timeline";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    validateUUID(id);
  } catch {
    return notFound();
  }
  const [
    contact,
    applications,
    contactTagRows,
    events,
    categories,
    allTags,
    initialContactThreads,
    adminAiAvailability,
  ] = await Promise.all([
    getContactById(id),
    getApplicationsByContactId(id),
    getContactTags(id),
    getContactEvents(id),
    getTagCategories(),
    getTags(),
    listAdminAiThreadSummaries({ scope: "contact", contactId: id }),
    getAdminAiProviderAvailability(),
  ]);

  if (!contact) return notFound();

  const latestApplication = applications[0] ?? null;
  const latestApplicationPhone =
    latestApplication && typeof latestApplication.answers.phone === "string"
      ? latestApplication.answers.phone
      : null;

  return (
    <div className="mx-auto max-w-5xl">
      <ContactDetailRealtimeRefresh contactId={contact.id} />

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

      {/* Two-column area: applications + timeline on the left; contact info + tags on the right */}
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
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

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline contactId={contact.id} events={events} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Contact Info</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Email</dt>
                  <dd>{contact.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Phone</dt>
                  <dd>{latestApplicationPhone || contact.phone || "—"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="overflow-visible">
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
        </div>
      </div>

      {/* Full-width AI Analyst strip */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">AI Analyst</CardTitle>
          <p className="text-xs text-muted-foreground">
            Each question runs a fresh grounded search. Past questions below
            are a log — they are not used as context.
          </p>
        </CardHeader>
        <CardContent>
          <AdminAiPanel
            scope="contact"
            contactId={contact.id}
            contactName={contact.name}
            initialThreads={initialContactThreads}
            providerAvailability={adminAiAvailability}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 10.2: Update the realtime-refresh component**

In `src/app/(dashboard)/admin/contacts/[id]/contact-detail-realtime-refresh.tsx`, find the `contact-detail-contact-notes-${contactId}` channel (around line 70) and replace it with a `contact-detail-contact-events-${contactId}` channel that listens on `contact_events` instead:

Replace this block:
```typescript
      supabase
        .channel(`contact-detail-contact-notes-${contactId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "contact_notes",
            filter: `contact_id=eq.${contactId}`,
          },
          scheduleRefresh,
        )
        .subscribe(),
```

With:
```typescript
      supabase
        .channel(`contact-detail-contact-events-${contactId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "contact_events",
            filter: `contact_id=eq.${contactId}`,
          },
          scheduleRefresh,
        )
        .subscribe(),
```

- [ ] **Step 10.3: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 10.4: Smoke-test manually**

Start the dev server in a separate terminal: `npm run dev`. Navigate to any contact detail page (e.g., `/admin/contacts/<an-id>`). Verify:
- The page renders without server errors.
- Existing notes appear as "Note" events in the Timeline card.
- The composer chips show all 8 types.
- Adding a Call with body "Briefed candidate" creates a new row at the top.
- Adding an Info requested event shows the amber resolve bar.
- Clicking Mark resolved clears the amber state.
- The AI Analyst section is below the two columns at full width.

Stop the dev server when done.

- [ ] **Step 10.5: Commit**

```bash
git add 'src/app/(dashboard)/admin/contacts/[id]/page.tsx' 'src/app/(dashboard)/admin/contacts/[id]/contact-detail-realtime-refresh.tsx'
git commit -m "feat(admin): swap notes card for timeline; AI analyst full-width

Left column now stacks Applications and Timeline. Right sidebar
keeps Contact Info and Tags. AI Analyst moves out of the left
column into a full-width card beneath. Realtime refresh listens
to contact_events instead of contact_notes."
```

---

## Phase H — Contacts list surfacing

### Task 11: Plumb contact_events through the admin data provider

**Files:**
- Modify: `src/app/(dashboard)/admin/admin-data-provider.tsx`

- [ ] **Step 11.1: Add contact events to the contacts context**

In `src/app/(dashboard)/admin/admin-data-provider.tsx`:

1. Add a new import at the top of the file:

```typescript
import type {
  Application,
  Profile,
  Contact,
  TagCategory,
  Tag,
  ContactTag,
  ContactEvent,
} from "@/types/database";
```

(adds `ContactEvent` to the existing import)

2. Extend the `AdminContactsContextValue` interface (around line 51) with a new field:

```typescript
interface AdminContactsContextValue {
  contacts: Contact[] | null;
  tagCategories: TagCategory[] | null;
  tags: Tag[] | null;
  contactTags: ContactTag[] | null;
  contactEventSummaries: ContactEventSummary[] | null;
  contactsError: string | null;
  ensureContacts: () => void;
}
```

Add `import type { ContactEventSummary } from "@/lib/data/contact-events";` near the other data-layer imports at the top.

3. Add a new constant near the existing `CONTACT_SELECT`:

```typescript
const CONTACT_EVENT_SUMMARY_SELECT =
  "contact_id, type, custom_label, happened_at, resolved_at";
```

4. Add state + fetch + subscription alongside the contacts fetch. In the `AdminDataProvider` body (around line 153), add the state:

```typescript
  const [contactEventSummaries, setContactEventSummaries] =
    useState<ContactEventSummary[] | null>(null);
```

5. In `ensureContacts`, extend the `Promise.all` to also fetch event summaries and store them:

Replace the block:
```typescript
      const [
        { data: contactsData, error: contactsErr },
        { data: tagCategoriesData, error: tagCategoriesErr },
        { data: tagsData, error: tagsErr },
        { data: contactTagsData, error: contactTagsErr },
      ] = await Promise.all([
        supabase.from("contacts").select(CONTACT_SELECT).order("name"),
        supabase
          .from("tag_categories")
          .select(TAG_CATEGORY_SELECT)
          .order("sort_order"),
        supabase.from("tags").select(TAG_SELECT).order("sort_order"),
        supabase.from("contact_tags").select("*"),
      ]);

      const fetchError = contactsErr ?? tagCategoriesErr ?? tagsErr ?? contactTagsErr;
```

With:
```typescript
      const [
        { data: contactsData, error: contactsErr },
        { data: tagCategoriesData, error: tagCategoriesErr },
        { data: tagsData, error: tagsErr },
        { data: contactTagsData, error: contactTagsErr },
        { data: contactEventSummariesData, error: contactEventSummariesErr },
      ] = await Promise.all([
        supabase.from("contacts").select(CONTACT_SELECT).order("name"),
        supabase
          .from("tag_categories")
          .select(TAG_CATEGORY_SELECT)
          .order("sort_order"),
        supabase.from("tags").select(TAG_SELECT).order("sort_order"),
        supabase.from("contact_tags").select("*"),
        supabase.from("contact_events").select(CONTACT_EVENT_SUMMARY_SELECT),
      ]);

      const fetchError =
        contactsErr ?? tagCategoriesErr ?? tagsErr ?? contactTagsErr ?? contactEventSummariesErr;
```

6. Right before `contactsFetchState.current = "done";`, add:
```typescript
      setContactEventSummaries(contactEventSummariesData ?? []);
```

7. Subscribe to realtime. After the existing `tagsChannel` block, add:

```typescript
      const contactEventsChannel = supabase
        .channel("admin-contact-events")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "contact_events" },
          (payload) => {
            const row = payload.new as ContactEvent;
            const summary: ContactEventSummary = {
              contact_id: row.contact_id,
              type: row.type,
              custom_label: row.custom_label,
              happened_at: row.happened_at,
              resolved_at: row.resolved_at,
            };
            setContactEventSummaries((prev) => [...(prev ?? []), summary]);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "contact_events" },
          (payload) => {
            const row = payload.new as ContactEvent;
            setContactEventSummaries((prev) =>
              (prev ?? []).map((s) =>
                s.contact_id === row.contact_id && s.happened_at === row.happened_at
                  ? {
                      contact_id: row.contact_id,
                      type: row.type,
                      custom_label: row.custom_label,
                      happened_at: row.happened_at,
                      resolved_at: row.resolved_at,
                    }
                  : s,
              ),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "contact_events" },
          (payload) => {
            const row = payload.old as ContactEvent;
            setContactEventSummaries((prev) =>
              (prev ?? []).filter(
                (s) =>
                  !(s.contact_id === row.contact_id && s.happened_at === row.happened_at),
              ),
            );
          },
        )
        .subscribe();
```

Add `contactEventsChannel` to the `channelsRef.current.push(...)` call in the same block:

```typescript
      channelsRef.current.push(contactsChannel, contactTagsChannel, tagCategoriesChannel, tagsChannel, contactEventsChannel);
```

> Note: keying UPDATE/DELETE on `(contact_id, happened_at)` is imperfect — two events at the same happened_at for the same contact will collide. This is rare (backdating by minute granularity) and acceptable for v1; if it bites in practice, add `id` to `ContactEventSummary` in a follow-up.

8. Update `contactsValue` (the useMemo around line 506):

```typescript
  const contactsValue = useMemo(
    () => ({
      contacts,
      tagCategories,
      tags,
      contactTags,
      contactEventSummaries,
      contactsError,
      ensureContacts,
    }),
    [
      contacts,
      tagCategories,
      tags,
      contactTags,
      contactEventSummaries,
      contactsError,
      ensureContacts,
    ],
  );
```

- [ ] **Step 11.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 11.3: Commit**

```bash
git add 'src/app/(dashboard)/admin/admin-data-provider.tsx'
git commit -m "feat(admin): fetch and subscribe to contact-event summaries"
```

### Task 12: Add "Last activity" column to the contacts list

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/last-activity-cell.tsx`
- Modify: `src/app/(dashboard)/admin/contacts/field-registry.ts`
- Modify: `src/app/(dashboard)/admin/contacts/contacts-panel-view-model.ts`
- Modify: `src/app/(dashboard)/admin/contacts/contacts-panel.tsx`

- [ ] **Step 12.1: Write the cell component**

Create `src/app/(dashboard)/admin/contacts/last-activity-cell.tsx`:

```typescript
"use client";

import type { ContactActivityDerivation } from "./events-derivation";

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diffMs);
  const days = Math.round(abs / 86_400_000);
  if (days === 0) {
    const hours = Math.round(abs / 3_600_000);
    if (hours === 0) return "just now";
    return `${hours}h ago`;
  }
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

interface LastActivityCellProps {
  derivation: ContactActivityDerivation;
}

export function LastActivityCell({ derivation }: LastActivityCellProps) {
  const { last_activity_at, last_activity_label, awaiting_applicant, awaiting_btm } =
    derivation;

  if (!last_activity_at || !last_activity_label) {
    return <span className="text-muted-foreground">—</span>;
  }

  const pending = awaiting_applicant || awaiting_btm;
  const tooltip =
    awaiting_applicant && awaiting_btm
      ? "Awaiting applicant and we owe a response"
      : awaiting_applicant
        ? "Awaiting applicant"
        : awaiting_btm
          ? "We owe a response"
          : "";

  return (
    <span className="flex items-center gap-1.5">
      {pending && (
        <span
          title={tooltip}
          aria-label={tooltip}
          className="inline-block h-2 w-2 rounded-full bg-amber-500"
        />
      )}
      <span>
        {last_activity_label} &middot; {formatRelative(last_activity_at)}
      </span>
    </span>
  );
}
```

- [ ] **Step 12.2: Register the column in the field registry**

In `src/app/(dashboard)/admin/contacts/field-registry.ts`, find the end of `FIELD_REGISTRY` array (around line 722, just before the closing `];`) and add a new virtual entry:

```typescript
  {
    key: "last_activity",
    label: "Last activity",
    type: "text",
    options: [],
    programs: ["filmmaking", "photography", "freediving", "internship"],
    curated: true,
  },
```

(Place it with the curated fields at the top, right after `travel_willingness`.)

- [ ] **Step 12.3: Plumb events through the view model**

In `src/app/(dashboard)/admin/contacts/contacts-panel-view-model.ts`:

1. Add imports:

```typescript
import type { ContactEventSummary } from "@/lib/data/contact-events";
import {
  deriveContactActivity,
  type ContactActivityDerivation,
} from "./events-derivation";
```

2. Extend `UseContactsPanelViewModelArgs` with a new field:

```typescript
interface UseContactsPanelViewModelArgs {
  applications: Application[] | null;
  contacts: Contact[] | null;
  contactTags: ContactTag[] | null;
  contactEventSummaries: ContactEventSummary[] | null;
  tags: Tag[] | null;
  tagCategories: TagCategory[] | null;
  visibleColumns: string[];
  search: string;
  selectedProgram: ProgramSlug | undefined;
  selectedTagIds: string[];
  columnFilters: Record<string, string[]>;
  pendingFilter: ("awaiting_applicant" | "awaiting_btm")[];
  sortBy: SortState | null;
  page: number;
  pageSize: number;
}
```

3. Destructure the new args and add the derivation lookup. At the top of the hook body, after `contactTagsByContactId`:

```typescript
  const eventsByContact = useMemo(() => {
    const map = new Map<string, ContactEventSummary[]>();
    for (const ev of contactEventSummaries ?? []) {
      const existing = map.get(ev.contact_id);
      if (existing) existing.push(ev);
      else map.set(ev.contact_id, [ev]);
    }
    return map;
  }, [contactEventSummaries]);

  const derivationsByContact = useMemo(() => {
    const map = new Map<string, ContactActivityDerivation>();
    for (const contact of contacts ?? []) {
      map.set(
        contact.id,
        deriveContactActivity(
          eventsByContact.get(contact.id) ?? [],
          appsByContact.get(contact.id) ?? EMPTY_APPLICATIONS,
        ),
      );
    }
    return map;
  }, [contacts, eventsByContact, appsByContact]);
```

4. Inside the `filtered` useMemo, add a pending-filter step after the `selectedTagIds` block:

```typescript
    if (pendingFilter.length > 0) {
      const wantApplicant = pendingFilter.includes("awaiting_applicant");
      const wantBtm = pendingFilter.includes("awaiting_btm");
      result = result.filter((contact) => {
        const d = derivationsByContact.get(contact.id);
        if (!d) return false;
        return (
          (wantApplicant && d.awaiting_applicant) ||
          (wantBtm && d.awaiting_btm)
        );
      });
    }
```

5. Extend the `filtered` useMemo's dependency array with `pendingFilter` and `derivationsByContact`. The full dep array becomes:

```typescript
  }, [
    appsByContact,
    columnFilters,
    contacts,
    derivationsByContact,
    pendingFilter,
    search,
    selectedProgram,
    selectedTagIds,
    sortBy,
    tagIdsByContactId,
    tags,
  ]);
```

6. In `paginatedRows`, include the derivation per row:

```typescript
  const paginatedRows = useMemo(
    () =>
      paginated.map((contact) => {
        const contactApplications =
          appsByContact.get(contact.id) ?? EMPTY_APPLICATIONS;
        return {
          contact,
          contactApplications,
          uniquePrograms: [...new Set(contactApplications.map((app) => app.program))],
          contactTagEntries:
            contactTagsByContactId.get(contact.id) ?? EMPTY_CONTACT_TAGS,
          derivation:
            derivationsByContact.get(contact.id) ?? {
              last_activity_at: null,
              last_activity_label: null,
              awaiting_applicant: false,
              awaiting_btm: false,
            },
        };
      }),
    [appsByContact, contactTagsByContactId, paginated, derivationsByContact],
  );
```

7. Update `hasAnyFilter`:

```typescript
  const hasAnyFilter =
    Boolean(search) ||
    Boolean(selectedProgram) ||
    selectedTagIds.length > 0 ||
    Object.keys(columnFilters).length > 0 ||
    pendingFilter.length > 0;
```

- [ ] **Step 12.4: Render the cell in the panel**

In `src/app/(dashboard)/admin/contacts/contacts-panel.tsx`:

1. Add the import near the other local imports at the top of the file:

```typescript
import { LastActivityCell } from "./last-activity-cell";
```

2. The panel currently iterates `activeFields` in a `TableRow` body (around line 530) and renders each cell via `renderFieldValue(contactApplications, field)`. Replace that block so the virtual `last_activity` key short-circuits to the new cell. Change:

```typescript
                      {activeFields.map((field) => (
                        <TableCell
                          key={field.key}
                          className="overflow-hidden whitespace-normal text-sm text-muted-foreground"
                        >
                          <div className="line-clamp-7 break-words">
                            {renderFieldValue(contactApplications, field)}
                          </div>
                        </TableCell>
                      ))}
```

to:

```typescript
                      {activeFields.map((field) => (
                        <TableCell
                          key={field.key}
                          className="overflow-hidden whitespace-normal text-sm text-muted-foreground"
                        >
                          <div className="line-clamp-7 break-words">
                            {field.key === "last_activity" ? (
                              <LastActivityCell derivation={row.derivation} />
                            ) : (
                              renderFieldValue(contactApplications, field)
                            )}
                          </div>
                        </TableCell>
                      ))}
```

> If the existing loop uses a different destructured variable name (e.g. `paginatedRow` instead of `row`), adapt the name — the important change is the branch on `field.key === "last_activity"`.

3. Plumb `contactEventSummaries` and `pendingFilter` into the `useContactsPanelViewModel` call. The panel currently calls `useAdminContactsData()` — add `contactEventSummaries` to the destructure and pass it into the view-model args alongside the existing ones:

```typescript
const {
  contacts,
  tagCategories,
  tags,
  contactTags,
  contactEventSummaries,
} = useAdminContactsData();
// ...
const viewModel = useContactsPanelViewModel({
  // existing args,
  contactEventSummaries,
  pendingFilter: state.pendingFilter,
});
```

(`state.pendingFilter` comes from panel state — added in Task 13.)

- [ ] **Step 12.5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors. If the `contacts-panel.tsx` changes surface additional mismatches, fix them — the plumbing is mechanical.

- [ ] **Step 12.6: Smoke-test**

Run `npm run dev`, open the admin dashboard. Open the column picker, toggle on "Last activity". Verify:
- Rows with an application show `Application submitted · …` if they have no events.
- A contact with an event logged via the contact detail page now shows `Call · 2d ago` (or the correct label) in the column.
- A contact with an open `info_requested` event shows an amber dot before the text.

- [ ] **Step 12.7: Commit**

```bash
git add 'src/app/(dashboard)/admin/contacts/last-activity-cell.tsx' 'src/app/(dashboard)/admin/contacts/field-registry.ts' 'src/app/(dashboard)/admin/contacts/contacts-panel-view-model.ts' 'src/app/(dashboard)/admin/contacts/contacts-panel.tsx'
git commit -m "feat(admin): add Last activity column with pending dot indicator"
```

### Task 13: Add the Pending filter

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/pending-filter.tsx`
- Modify: `src/app/(dashboard)/admin/contacts/contacts-panel-state.ts`
- Modify: `src/app/(dashboard)/admin/contacts/contacts-filters.tsx`
- Modify: `src/app/(dashboard)/admin/contacts/contacts-panel.tsx`

- [ ] **Step 13.1: Write the filter component**

Create `src/app/(dashboard)/admin/contacts/pending-filter.tsx`:

```typescript
"use client";

import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

export type PendingFilterValue = "awaiting_applicant" | "awaiting_btm";

interface PendingFilterProps {
  value: PendingFilterValue[];
  onChange: (next: PendingFilterValue[]) => void;
}

const OPTIONS: { value: PendingFilterValue; label: string }[] = [
  { value: "awaiting_applicant", label: "Awaiting applicant" },
  { value: "awaiting_btm", label: "We owe response" },
];

export function PendingFilter({ value, onChange }: PendingFilterProps) {
  function toggle(v: PendingFilterValue) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  const activeCount = value.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted ${
            activeCount > 0 ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          Pending
          {activeCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-100 px-1 text-[10px] font-medium text-amber-900">
              {activeCount}
            </span>
          )}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
          >
            <Checkbox
              checked={value.includes(o.value)}
              onCheckedChange={() => toggle(o.value)}
            />
            <span className="text-xs">{o.label}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 13.2: Add state to contacts-panel-state**

In `src/app/(dashboard)/admin/contacts/contacts-panel-state.ts`:

1. Add an import near the top:

```typescript
import type { PendingFilterValue } from "./pending-filter";
```

2. Extend the `StoredFilters` type (around line 28):

```typescript
type StoredFilters = {
  search?: string;
  selectedProgram?: ProgramSlug;
  selectedTagIds?: string[];
  columnFilters?: Record<string, string[]>;
  pendingFilter?: PendingFilterValue[];
  sortBy?: SortState | null;
  pageSize?: PageSize;
  page?: number;
  columnWidths?: Record<string, number>;
};
```

3. Add state next to `selectedTagIds` (around line 73):

```typescript
  const [pendingFilter, setPendingFilter] = useState<PendingFilterValue[]>(
    storedFilters.pendingFilter ?? [],
  );
```

4. Add `pendingFilter` to the localStorage-persist `useEffect` body AND its dependency array (around line 127–153):

```typescript
  useEffect(() => {
    try {
      localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          search,
          selectedProgram,
          selectedTagIds,
          columnFilters,
          pendingFilter,
          sortBy,
          pageSize,
          page,
          columnWidths,
        }),
      );
    } catch {
      /* localStorage unavailable */
    }
  }, [
    columnFilters,
    columnWidths,
    page,
    pageSize,
    pendingFilter,
    search,
    selectedProgram,
    selectedTagIds,
    sortBy,
  ]);
```

5. Add a handler for changes (next to `handleClearTags`):

```typescript
  const handlePendingFilterChange = useCallback(
    (next: PendingFilterValue[]) => {
      setPendingFilter(next);
      setPage(1);
      clearSelection();
    },
    [clearSelection],
  );
```

6. Extend `handleClearAllFilters` to also clear it:

```typescript
  const handleClearAllFilters = useCallback(() => {
    setSearch("");
    setSelectedProgram(undefined);
    setSelectedTagIds([]);
    setColumnFilters({});
    setPendingFilter([]);
    setSortBy(null);
    setPage(1);
    clearSelection();
  }, [clearSelection]);
```

7. Add `pendingFilter` and `handlePendingFilterChange` to the hook's return object (around line 361):

```typescript
  return {
    // ...existing return keys,
    pendingFilter,
    handlePendingFilterChange,
  };
```

- [ ] **Step 13.3: Render the filter in the filter bar**

In `src/app/(dashboard)/admin/contacts/contacts-filters.tsx`:

1. Add to the props interface:

```typescript
  pendingFilter: ("awaiting_applicant" | "awaiting_btm")[];
  onPendingFilterChange: (next: ("awaiting_applicant" | "awaiting_btm")[]) => void;
```

2. Destructure them in the component signature.

3. Render `<PendingFilter value={pendingFilter} onChange={onPendingFilterChange} />` at the end of the first row of controls (after `<ColumnPicker>` around line 96).

Add the import at the top:

```typescript
import { PendingFilter } from "./pending-filter";
```

- [ ] **Step 13.4: Plumb through contacts-panel**

In `src/app/(dashboard)/admin/contacts/contacts-panel.tsx`:

1. `state.pendingFilter` and `state.handlePendingFilterChange` are now exposed by the `useContactsPanelState` hook (Task 13.2). Pass them to the filter bar:

```tsx
<ContactsFilters
  // ...existing props
  pendingFilter={state.pendingFilter}
  onPendingFilterChange={state.handlePendingFilterChange}
/>
```

2. Also pass `state.pendingFilter` into the `useContactsPanelViewModel` call — this was added in Task 12.4 Step 3 but note it must come from `state`, not a new local variable:

```tsx
const viewModel = useContactsPanelViewModel({
  // existing args,
  contactEventSummaries,
  pendingFilter: state.pendingFilter,
});
```

- [ ] **Step 13.5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 13.6: Smoke-test**

Run `npm run dev`. In the admin dashboard:
- Open the Pending filter; toggle "Awaiting applicant". Confirm only contacts with an open `info_requested` remain.
- Toggle both options. Confirm the list is the union.
- Refresh the page. Confirm the filter state persists (localStorage).

- [ ] **Step 13.7: Commit**

```bash
git add 'src/app/(dashboard)/admin/contacts/pending-filter.tsx' 'src/app/(dashboard)/admin/contacts/contacts-panel-state.ts' 'src/app/(dashboard)/admin/contacts/contacts-filters.tsx' 'src/app/(dashboard)/admin/contacts/contacts-panel.tsx'
git commit -m "feat(admin): add Pending filter with multi-select awaiting directions"
```

---

## Phase I — Remove legacy notes code

### Task 14: Delete the note form and its actions

**Files:**
- Delete: `src/app/(dashboard)/admin/contacts/[id]/contact-note-form.tsx`
- Modify: `src/app/(dashboard)/admin/contacts/actions.ts`
- Modify: `src/app/(dashboard)/admin/contacts/actions.test.ts`
- Modify: `src/lib/data/contacts.ts`

- [ ] **Step 14.1: Delete the component**

```bash
rm 'src/app/(dashboard)/admin/contacts/[id]/contact-note-form.tsx'
```

- [ ] **Step 14.2: Remove `addNote` and `submitContactNote` from actions**

In `src/app/(dashboard)/admin/contacts/actions.ts`:

- Delete the `contactNoteSchema` constant.
- Delete the `ContactNoteFormState` type.
- Delete the `addNote` function.
- Delete the `submitContactNote` function.
- Remove `addContactNote` from the `@/lib/data/contacts` import list.

- [ ] **Step 14.3: Update the actions test file**

In `src/app/(dashboard)/admin/contacts/actions.test.ts`:

- Remove the `mockAddContactNote` declaration.
- Remove `addContactNote: mockAddContactNote` from the `@/lib/data/contacts` mock.
- Remove `submitContactNote` from the `await import("./actions")` destructure.
- Remove any `describe("submitContactNote")` block entirely.

- [ ] **Step 14.4: Remove data-layer notes functions**

In `src/lib/data/contacts.ts`:

- Delete `getContactNotes` (the `cache(async function …)` export near line 332).
- Delete `addContactNote` (near line 344).
- Remove `ContactNote` from the `@/types/database` import list.

> Leave the `ContactNote` type definition in `src/types/database.ts` untouched for now — it's unused after this task, but deleting it belongs in the Phase 3 cleanup PR alongside `DROP TABLE contact_notes`.

- [ ] **Step 14.5: Run the full test suite and type-check**

```bash
npm test -- --run
npx tsc --noEmit
```

Expected: all tests pass, zero type errors.

- [ ] **Step 14.6: Smoke-test the page**

Run `npm run dev`. Open a contact detail page. Verify:
- Old notes still appear (as Note events in the timeline).
- No "Add Note" form appears anywhere.
- Timeline composer is the only way to add entries.
- No console errors.

- [ ] **Step 14.7: Commit**

```bash
git add -u
git commit -m "refactor(admin): remove legacy note form and data-layer helpers

Timeline composer is the sole surface for logging on contacts.
contact_notes table remains in place (frozen) — a follow-up PR
will drop it after a prod observation window."
```

---

## Phase J — Final validation

### Task 15: Final validation pass

**Files:** none (verification only)

- [ ] **Step 15.1: Run everything**

```bash
npm test -- --run
npx tsc --noEmit
npm run lint
```

Expected: all pass. Fix any residual issues before proceeding.

- [ ] **Step 15.2: Two-tab realtime manual check**

Open `npm run dev`, then open the same contact detail URL in two separate browser tabs. In Tab 1, add a Call event. Within ~200ms, Tab 2 should re-render and show the new event. Repeat for: edit, resolve, delete. Document this step in the PR description.

- [ ] **Step 15.3: Migration dry-run in a clean local DB**

Confirm the migration still applies to a fresh local DB (tests that the assertion doesn't false-positive on an empty `contact_notes`):

```bash
supabase db reset --local
```

Expected: all migrations apply cleanly, including the new one. The assertion passes because both counts are 0.

- [ ] **Step 15.4: Open a PR**

```bash
git push -u origin feat/contact-timeline
gh pr create --title "feat(admin): contact events timeline" --body "$(cat <<'EOF'
## Summary
- Replaces contact notes with a unified polymorphic event timeline
- Adds Last activity column and Pending filter to the contacts list
- Restructures the contact detail page: Applications + Timeline stacked in the left column; AI Analyst full-width underneath

## Migration
- Adds `contact_events` table + enum + indexes + RLS + realtime
- Backfills `contact_notes` as `type='note'` with a hard row-count assertion
- `contact_notes` is left in place (frozen). A separate follow-up PR will drop it after ~1 week of prod observation.

## Test plan
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` zero errors
- [ ] Contact detail page: add/edit/resolve/delete each event type
- [ ] Two-tab realtime: event logged in Tab 1 appears in Tab 2
- [ ] Contacts list: Last activity column, amber dot, and Pending filter work
- [ ] After apply on prod: row counts for contact_notes == contact_events(type='note')
EOF
)"
```

> **Do not push or open a PR without explicit user approval.** Commit locally, let the user test, then push when they ask.

---

## Deferred follow-ups (separate PRs, not this plan)

- **Phase 3 cleanup migration.** After ~1 week of prod observation, a new PR adds `supabase/migrations/<date>_drop_contact_notes.sql` containing `DROP TABLE contact_notes;` and removes the `ContactNote` type from `src/types/database.ts`.
- **Mentor role + multi-assignment feature.** Mentor-assigned events switch from text body to `metadata.mentor_user_id`.
- **Reusable custom event type registry.** If admins start re-typing the same custom labels often.
