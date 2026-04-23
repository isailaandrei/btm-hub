# Contact events timeline

Per-contact chronological event log for admins tracking interactions with applicants. Replaces the current `contact_notes` surface with a unified, typed event stream.

## Goals

1. **Historical paper trail** — primary use case. Reconstruct what happened with a contact at any point.
2. **Current-state visibility** — secondary. Surface pending state ("awaiting applicant", "we owe response") on both the contact detail page and contacts list.
3. **Lightweight admin coordination** — byproduct. Every event has an author and timestamp.

## Out of scope (deliberate, tracked for follow-up)

- **Mentor role + multi-assignment system.** `mentor_assigned` events will store the mentor name in `body` for now. `metadata.mentor_user_id` is reserved for the future feature.
- **Reusable custom event types** (admin-defined types in a registry). Custom events use ad-hoc `custom_label` strings per event.
- **Notifications** (email, Slack, in-app) on new events.
- **Stages / pipeline state** and a "Stage change" event type.
- **Edit history / audit log.** Editing updates the row in place.

## Data model

### Enum and table

```sql
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

CREATE TABLE contact_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type          contact_event_type NOT NULL,
  custom_label  text,                       -- required iff type='custom'; else NULL
  body          text NOT NULL DEFAULT '' CHECK (char_length(body) <= 5000),
  happened_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  author_id     uuid NOT NULL REFERENCES auth.users(id),
  author_name   text NOT NULL,
  edited_at     timestamptz,                -- NULL until first edit; drives "edited …" indicator
  resolved_at   timestamptz,                -- only meaningful for resolvable types
  resolved_by   uuid REFERENCES auth.users(id),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (type <> 'custom' OR (custom_label IS NOT NULL AND char_length(custom_label) > 0)),
  CHECK (type IN ('info_requested', 'awaiting_btm_response') OR resolved_at IS NULL)
);

CREATE INDEX idx_contact_events_contact_happened
  ON contact_events (contact_id, happened_at DESC);

CREATE INDEX idx_contact_events_open_pending
  ON contact_events (contact_id, type)
  WHERE resolved_at IS NULL
    AND type IN ('info_requested', 'awaiting_btm_response');
```

### RLS

Admin-only for SELECT / INSERT / UPDATE / DELETE. Mirrors the existing `contact_notes` policy pattern (checks `profiles.role = 'admin'`).

### Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE contact_events;
ALTER TABLE contact_events REPLICA IDENTITY FULL;
```

### Event type semantics

| Type | Resolvable? | Body | Notes |
|---|---|---|---|
| `note` | No | Required | Migrated from `contact_notes` |
| `call` | No | Optional | Phone call occurred |
| `in_person_meeting` | No | Optional | In-person or video meeting |
| `message` | No | Optional | WhatsApp / DM / SMS |
| `info_requested` | Yes | Required | We asked applicant for something; open = waiting on applicant |
| `awaiting_btm_response` | Yes | Required | Applicant awaits our reply; open = we owe a response |
| `mentor_assigned` | No | Required | Text mentor name in body (until mentor feature lands) |
| `custom` | No | Optional | Requires `custom_label` (≤ 80 chars) |

No `direction` field on communication types (user decision). No separate `info_received` type — resolution is a state change on `info_requested`.

## Migration plan (lossless)

Explicit priority from the user: **no data loss under any circumstance**.

### Phase 1 — additive migration (one migration file, single transaction)

New migration: `supabase/migrations/<timestamp>_contact_events.sql`

1. Create `contact_event_type` enum.
2. Create `contact_events` table + indexes + RLS policies.
3. Add to realtime publication, set `REPLICA IDENTITY FULL`.
4. Backfill existing `contact_notes`:
   ```sql
   INSERT INTO contact_events
     (id, contact_id, type, body, happened_at, created_at, updated_at,
      author_id, author_name)
   SELECT
     id, contact_id, 'note'::contact_event_type, text,
     created_at,   -- happened_at = created_at (no backdating info for old notes)
     created_at,
     created_at,   -- contact_notes has no updated_at; seed with created_at
     author_id, author_name
   FROM contact_notes;
   ```
5. Hard row-count assertion — whole migration aborts if mismatch:
   ```sql
   DO $$
   DECLARE
     src_count bigint;
     dst_count bigint;
   BEGIN
     SELECT count(*) INTO src_count FROM contact_notes;
     SELECT count(*) INTO dst_count FROM contact_events WHERE type = 'note';
     IF src_count <> dst_count THEN
       RAISE EXCEPTION 'backfill mismatch: contact_notes=% contact_events(note)=%',
         src_count, dst_count;
     END IF;
   END $$;
   ```

`contact_notes` is left untouched. Verify locally via `supabase db push --local` before prod.

### Phase 2 — code cutover (same PR or immediately after Phase 1)

All reads/writes for notes switch from `contact_notes` → `contact_events` (filtered to `type='note'` where the UI specifically wants notes, though the unified timeline reads all types).

`contact_notes` is now frozen (no new writes). If rollback is ever needed, the code revert is enough; any notes written during the broken window remain in `contact_events` and can be recovered ad-hoc via a copy query if needed — no pre-written script (user decision).

### Phase 3 — cleanup (separate PR, merged after ~1 week of prod observation)

New migration:

```sql
DROP TABLE contact_notes;
```

Deliberately in its own PR so dropping the source table is a conscious, delayed decision.

### Invariants

- Phase 1 is fully reversible (transactional; nothing dropped).
- Phase 2 is reversible via code revert; data loss window requires manual recovery.
- Phase 3 is the only destructive step, and it is explicit and delayed.

## UI

### Contact detail page layout

Revised from the current three-card right sidebar:

```
┌──────────────────────────────────────────────────┐
│ Header: ← Back · Jane Applicant · jane@...       │
├──────────────────────────┬───────────────────────┤
│ Applications             │ Contact info          │
│                          │ Tags                  │
│ Timeline                 │                       │
│  (composer + event rows) │                       │
├──────────────────────────┴───────────────────────┤
│ AI Analyst  (full-width strip)                   │
└──────────────────────────────────────────────────┘
```

Changes from today's layout:
- **Applications** stays in the left column at the top.
- **Timeline** is the new second card in the left column, under Applications.
- **Admin Notes** card is removed (replaced by Timeline).
- **AI Analyst** moves out of the left column into a full-width section below both columns.
- **Contact info** and **Tags** stay in the right sidebar.

### Composer

Inline at the top of the Timeline card.

- **Type chips** — eight buttons for the predefined types, clickable to select one. Active chip is highlighted.
- **Body textarea** — required for types that require body (see semantics table), optional otherwise. 5000-char cap, remaining-char counter after 4500.
- **Custom label field** — visible only when `custom` chip is selected. Required, ≤ 80 chars.
- **Happened-at datetime picker** — defaults to `now()`. Future timestamps rejected (≤ `now() + 1 minute` tolerance for clock skew). Backdating permitted.
- **Submit button** — "Add to timeline".

### Event row

Single uniform row shape across all types:

- **Icon** — small colored circle with a type-specific glyph (implemented as inline SVG, not emoji).
- **Type label** — capitalized; `custom` rows show a small pill badge with the `custom_label`.
- **Body** — rendered as plain text, line-break preserving.
- **Footer** — `Author · <relative time> · <absolute date>`, plus "edited <relative time>" when `edited_at IS NOT NULL`.
- **Actions** — Edit / Delete inline links.

For open `info_requested` / `awaiting_btm_response` rows:
- Amber left border and icon background.
- Inline resolve bar below the body with "Awaiting response" text and a "Mark resolved" button.
- Once resolved, the border/icon normalize and a "Reopen" link appears in the actions row.

Sort: `happened_at DESC` (newest on top).

### Contacts list surfacing

Single new column **"Last activity"** — always populated per row:

- Format: `<event type> · <relative time>` (e.g. `Call · 2d ago`, `Info requested · 1w ago`).
- Fallback when a contact has no events: `Application submitted · <time>` using the contact's most recent application's `created_at`.
- `—` only when the contact has neither events nor applications.
- Toggleable via the existing column picker. Default: **on**.

**Pending indicator** — small amber dot rendered before the cell text when the contact has any open `info_requested` or `awaiting_btm_response` event. Tooltip distinguishes direction. No separate column.

**Pending filter** — one new filter control slotted into the existing filter bar, following the same pattern as the tag-category filters (single dropdown, multi-select). Options:
- "Awaiting applicant"
- "We owe response"

Selecting one filters to open `info_requested` (awaiting applicant) or open `awaiting_btm_response` (we owe). Selecting both is a union. Composes with existing tag/category filters.

Filtering and sorting remain **client-side**, in line with the existing contacts panel pattern. The initial page load fetches derived state alongside the contacts list:

```sql
SELECT
  c.*,
  max(e.happened_at) AS last_activity_at,
  max(e.happened_at) FILTER (WHERE ...) AS last_activity_type, -- or compute via subquery
  bool_or(e.type = 'info_requested'        AND e.resolved_at IS NULL) AS awaiting_applicant,
  bool_or(e.type = 'awaiting_btm_response' AND e.resolved_at IS NULL) AS awaiting_btm
FROM contacts c
LEFT JOIN contact_events e ON e.contact_id = c.id
GROUP BY c.id;
```

(Exact query shape is an implementation detail; the last-activity-type may be derived via a correlated subquery or lateral join.)

## Edge cases and behaviors

- **Backdated events.** `happened_at` can be past; timeline re-sorts. Cannot be in the future (server-action validation).
- **Resolving.** Stamps `resolved_at = now()`, `resolved_by = auth.uid()`. No secondary log event created.
- **Unresolving.** "Reopen" action clears `resolved_at` and `resolved_by`.
- **Custom label.** Required when `type='custom'`, validated client-side, server-side, and by DB CHECK.
- **Author attribution.** `author_id` and `author_name` snapshotted at write time. Name changes do not propagate to historical events (intentional).
- **Editing.** Inline, not modal. Updates `updated_at` and `edited_at` to `now()`. No edit history.
- **Deletion.** Hard delete, with confirm dialog. No soft-delete.
- **Cascade.** Deleting a contact cascades to its events.
- **Empty state.** Contact with no events shows "No activity yet. Add the first event above." in the timeline card.
- **Concurrent edits.** No optimistic locking. If admin A edits while B deletes, A's save returns not-found; UI shows "This event was deleted" and reverts edit state.

## Testing

### Unit tests (Vitest, colocated)

- `contact-events-view-model.test.ts` — derives `last_activity_at`, `last_activity_type`, `awaiting_applicant`, `awaiting_btm` from mock events; fallback to `Application submitted`; sort order.
- `contact-events-filter.test.ts` — multi-select semantics; composes with existing tag/category filters.
- `contact-events-actions.test.ts` — server-action validation: future `happened_at` rejection, `type='custom'` requires `custom_label`, `resolved_at` only allowed on resolvable types.

### Migration verification

- The `DO $$ … $$` row-count assertion inside the migration is the lossless guarantee.
- Local dry-run via `supabase db push --local` (already automated via hook) before prod.

### Component tests (React Testing Library)

- `TimelineComposer.test.tsx` — chip switches type; custom label field visibility; datetime defaults to now; submit payload shape.
- `EventRow.test.tsx` — per-type rendering; resolve button visibility; edit/delete flow; `edited_at` indicator.

### Contacts list integration

- Extend `field-registry.test.ts` and `sort-helpers.test.ts` with cases for the new `last_activity_at` field and pending-filter composition.

### Manual verification (documented in PR description)

- Realtime: two browser windows on the same contact; logging an event in one appears in the other.

### Deliberately untested

- RLS policies (identical trust model to `contact_notes`, copy-pasted).
- Visual polish / CSS.
- End-to-end browser tests (covered by component tests + manual realtime check).

## Open questions

None. All decisions locked during brainstorming.
