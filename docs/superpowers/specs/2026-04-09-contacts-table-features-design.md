# Admin Contacts Table: Column Visibility, Filtering & Bulk Tagging

## Overview

Three features for the admin contacts table:

1. **Column visibility** — add/remove application-derived columns (budget, skills, etc.)
2. **Column filtering** — filter by any visible column's discrete values
3. **Bulk tag assignment** — select multiple contacts and assign a tag at once

No database schema changes for the table features. One small migration: add a `preferences` JSONB column to `profiles` for persisting per-admin column visibility.

## 1. Application Fields Registry

A static registry mapping form field names to display metadata, derived from the form definitions in `src/lib/academy/forms/`.

### Included field types

- `select` — single-choice fields (budget, certification_level, etc.)
- `multiselect` — multi-choice fields (diving_types, learning_aspects, etc.)
- `rating` — 1-10 integer ratings (skill_storytelling, buoyancy_skill, etc.)

### Excluded field types

- `text` / `text multiline` — free-form, not useful as table columns or filters
- `date` — only a couple exist (last_dive_date), not useful for discrete filtering

### Registry entry shape

```ts
interface FieldRegistryEntry {
  key: string;              // form field name, e.g. "budget"
  label: string;            // display label, e.g. "Budget"
  type: "select" | "multiselect" | "rating";
  options: string[];        // predefined values (for rating: ["1","2",...,"10"])
  programs: ProgramSlug[];  // which programs include this field
  curated: boolean;         // true = shown in the shortlist
}
```

### Curated shortlist (8 fields)

These appear upfront in the column picker without searching:

| Key                  | Label                | Type   | Programs                          |
|----------------------|----------------------|--------|-----------------------------------|
| budget               | Budget               | select | filmmaking, photography, freediving |
| time_availability    | Time Availability    | select | filmmaking, photography, freediving |
| start_timeline       | Start Timeline       | select | filmmaking, photography, freediving |
| btm_category         | BTM Category         | select | filmmaking, photography, freediving |
| certification_level  | Certification Level  | select | filmmaking, photography (freediving has own) |
| years_experience     | Years of Experience  | select | filmmaking, photography            |
| involvement_level    | Involvement Level    | select | filmmaking, photography            |
| travel_willingness   | Travel Willingness   | select | filmmaking, photography, freediving |

### Full list

All remaining `select`, `multiselect`, and `rating` fields from all form definitions. Accessible via keyword search in the column picker. Personal-step fields (name, email, phone, country, etc.) excluded since they're already core columns or not relevant.

### Building the registry

The registry is a static constant (not computed at runtime from form definitions). Derived once from the form configs and maintained as a source-of-truth array in a new file, e.g. `src/app/(dashboard)/admin/contacts/field-registry.ts`.

Rationale: form definitions import heavy option arrays and have complex structures. A flat registry is simpler for the table to consume and avoids coupling the admin table to form internals.

### Cell rendering for application-derived columns

- **Single application:** just the value (e.g., "$5,000-$10,000")
- **Multiple applications:** prefixed by program (e.g., "filmmaking: $5,000-$10,000 · photography: $1,000-$3,000")
- **Field doesn't exist on contact's program:** "—"
- **Multiselect fields:** comma-joined values within each program
- **Rating fields:** numeric value (e.g., "7")

## 2. Column Visibility

### UI

A **"Columns" button** in the filter bar (next to search and program dropdown). Opens a popover:

- **Search input** at top — filters registry entries by label keyword
- **"Suggested" section** — the 8 curated fields as checkboxes (hidden when search is active, replaced by search results)
- **Search results** — matching fields from the full registry, each showing program badges so the admin knows which programs the field applies to
- Checking a field adds the column; unchecking removes it

### Column ordering

Application-derived columns appear after the 5 core columns (Name, Email, Phone, Programs, Tags), in the order they were toggled on.

### Core columns

Name, Email, Phone, Programs, Tags — always visible, not toggleable.

### Table layout

The table already has `overflow-x-auto`. Application-derived columns use compact widths since values are short strings/numbers.

### Persistence

Column visibility saved to `profiles.preferences` JSONB column (new migration). Shape:

```json
{
  "contacts_table": {
    "visible_columns": ["budget", "time_availability", "btm_category"]
  }
}
```

- Read on mount from the admin's profile (already fetched via `ensureProfiles` or a dedicated fetch)
- Written on every toggle via a debounced server action `updatePreferences(patch)` that deep-merges the patch into existing preferences (so other future preferences aren't overwritten)
- Falls back to empty set (no extra columns) if no saved preference

### Migration

```sql
ALTER TABLE profiles ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}';
```

## 3. Column Filtering

### Which columns are filterable

Every column in the registry (select, multiselect, rating). If a column is visible, it's filterable. Core columns retain their existing filter mechanisms (search box for name/email, program dropdown, tag badges).

### Filter UI

- Each application-derived column header shows a **filter icon** (small, inline)
- Clicking opens a **popover with multi-select checkboxes**
- Options come from the **predefined option list** in the registry (not derived from data)
- Rating columns show checkboxes 1-10
- Active filter indicated by highlighted icon + count badge (e.g., "2")
- Each popover has a "Clear" button

### Filter logic

- **Between columns: AND** — contact must match ALL active column filters
- **Within a column: OR** — contact matches if ANY of the selected values match
- **Across applications: OR** — a contact matches a filter if ANY of their applications contains a matching value for that field
- Combines with existing filters (search, program, tags) via AND

### Filter state

```ts
// key = field registry key, value = selected option values
type ColumnFilters = Record<string, string[]>;
```

Ephemeral — resets on page reload. Filters are transient queries, not preferences.

### Global clear

A "Clear all filters" button appears when any filter (existing or column-level) is active.

## 4. Bulk Tag Assignment

### Selection UI

- **Checkbox column** on the far left of the table
- **Header checkbox:** select all / deselect all on the current page
- **Row checkboxes:** toggle individual contacts
- Selection state: `Set<string>` of contact IDs
- **Clears on:** filter change, page change (since the visible set changes)

### Action bar

When 1+ contacts selected, a **sticky bar** appears at the bottom of the table container:

```
[ X contacts selected ]  [ Category ▾ ] [ Tag ▾ ] [ Assign ]  [ Clear selection ]
```

- Category dropdown filters the tag dropdown (same UX as the existing ContactTagManager)
- "Assign" button triggers the bulk action
- "Clear selection" dismisses the bar

### Server action

New action in `src/app/(dashboard)/admin/contacts/actions.ts`:

```ts
async function bulkAssignTag(contactIds: string[], tagId: string)
```

- Validates all IDs are UUIDs via Zod
- Requires admin auth via `requireAdmin()`
- Single Supabase upsert: `supabase.from("contact_tags").upsert(rows, { onConflict: "contact_id,tag_id" })`
- Idempotent — assigning an already-assigned tag is a no-op per row
- Revalidates `/admin`

### After assignment

- Toast: "Tag assigned to X contacts"
- Selection stays (so the admin can assign another tag to the same group without re-selecting)
- UI updates automatically via the existing Realtime subscription on `contact_tags`

## State Summary

| State                | Location                  | Persisted?                  |
|----------------------|---------------------------|-----------------------------|
| Visible columns      | Component state           | Yes — `profiles.preferences` |
| Column filters       | Component state           | No — ephemeral              |
| Selected contact IDs | Component state           | No — ephemeral              |
| Search / program / tag filters | Component state  | No — ephemeral (existing)   |

## File Changes

| File | Change |
|------|--------|
| `src/app/(dashboard)/admin/contacts/field-registry.ts` | **New** — static field registry |
| `src/app/(dashboard)/admin/contacts/contacts-panel.tsx` | Add column visibility, filtering, selection state; render dynamic columns; render bulk action bar |
| `src/app/(dashboard)/admin/contacts/contacts-filters.tsx` | Add "Columns" button + popover |
| `src/app/(dashboard)/admin/contacts/column-filter-popover.tsx` | **New** — reusable filter popover for column headers |
| `src/app/(dashboard)/admin/contacts/bulk-action-bar.tsx` | **New** — sticky bar with tag picker |
| `src/app/(dashboard)/admin/contacts/actions.ts` | Add `bulkAssignTag` + `updatePreferences` actions |
| `src/lib/data/contacts.ts` | Add `getPreferences` / `updatePreferences` fetchers |
| `src/types/database.ts` | Add `preferences` to Profile type |
| `supabase/migrations/...` | Add `preferences` JSONB column to profiles |
