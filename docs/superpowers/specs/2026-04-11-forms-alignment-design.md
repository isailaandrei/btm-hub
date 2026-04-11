# Design — Forms alignment (code ↔ Google Forms) + admin filter cleanup

**Status:** approved, ready for implementation plan
**Date:** 2026-04-11
**Companion doc:** [2026-04-11-forms-alignment-diff.md](./2026-04-11-forms-alignment-diff.md) — exhaustive enum-by-enum diff. This spec is the plan; the diff is the line-item reference.

## Context

BTM's admin Contacts table displays applications from 4 programs (filmmaking, photography, freediving, internship). All 99 existing rows were collected via 4 Google Forms authored by partner A and imported into `applications.answers` (JSONB). The form-code definitions under `src/lib/academy/forms/` were intended to mirror those Google Forms so the website could collect new applications in the same shape — but an AI-assisted first pass left them badly misaligned: enum option lists differ wildly, several field types are wrong, and three internship field keys don't match the stored DB keys at all.

Because of that drift, the admin table's column filter dropdowns can't use the form-code option lists. A workaround at `contacts-panel.tsx:131-148` infers filter options from the actual DB values instead — which surfaces every typo, every free-text "Other" response, and every legacy value as a separate filter option. Filtering is unusable.

The website forms have never been used for live submissions, so there are no production website writes to worry about. Google Forms is the sole source of new data today and will remain so until partner A migrates.

## Goals

1. **Form code becomes a faithful mirror of the live Google Forms.** Every enum, field type, field key, and required flag in `src/lib/academy/forms/` matches what partner A's Google Forms actually ask today.
2. **Form code supports "Other" free-text input** natively, so future website submissions can produce the same shape as existing Google Forms data.
3. **`common/options.ts` becomes the single source of truth** for every option enum — no more program-specific constants scattered across `filmmaking.ts` / `freediving-modelling.ts` / `internship.ts`.
4. **Admin filter dropdowns use curated options** from the field registry, with an "Other" bucket that matches any row whose raw value isn't in the canonical list. The `dataOptions` workaround is deleted.
5. **Existing DB rows with known typos or split-array bugs are normalized** via a Supabase migration, so filters catch old and new data uniformly.

## Non-goals (explicitly out of scope for this spec)

- **Filter normalization across fundamentally different concepts** — e.g., mapping internship's numeric ages into `AGE_RANGES` buckets, or mapping `CERTIFICATION_LEVELS_SCUBA` ↔ `FREEDIVING_CERTIFICATION_LEVELS` to a common "skill tier". Those belong to a follow-up **Phase B** spec.
- **Changing the Google Forms themselves.** Partner A owns those. We'll flag the places where their forms drifted from each other (e.g., internship's `"specify level below"` vs filmmaking/photography's `"please specify level below:"`) as a partner-side cleanup, but this spec doesn't block on it.
- **Re-designing the admin table layout, column picker, or bulk actions.** They stay as-is.
- **Data migration of non-typo-driven legacy values** (e.g., the one freediving row with `"SSI level 2"` which is no longer in the current Google Form). Those get handled by Phase B filter normalization, not by SQL rewrites.

## Approach

Two deliverables, split to minimize risk:

**Phase A** — one pull request containing form-code alignment + admin filter cleanup + one Supabase migration for the known typo/split-array fixes.
**Phase B** — later, separate spec. Filter canonicalization for concepts that genuinely differ across programs (numeric vs range ages; scuba vs freediving cert tiers).

This spec covers Phase A only. Phase B lives in its own spec once A ships.

## Architecture

### 1. Add `allowOther` to the field definition types

In `src/lib/academy/forms/types.ts`, extend both selection field types with an optional `allowOther` flag. When set, the form renderer displays a free-text input below the options; submissions from the renderer either store the canonical option string or the user-supplied custom text directly in the same field.

```ts
export interface SelectFieldDef extends FieldBase {
  type: "select";
  options: readonly string[];
  columns?: 1 | 2 | 3;
  allowOther?: boolean;
}

export interface MultiSelectFieldDef extends FieldBase {
  type: "multiselect";
  options: readonly string[];
  columns?: 1 | 2 | 3;
  allowOther?: boolean;
}
```

**Storage shape (chosen to match how Google Forms already stores Other responses):**

- For `select` + `allowOther: true`: `answers[fieldName]` is either an option string or the user's free text. From the admin's perspective, anything not in the canonical option list means "Other".
- For `multiselect` + `allowOther: true`: `answers[fieldName]` is an array; the Other text is one of the array elements. Anything in the array that isn't in the canonical option list is counted as Other.

**No side-field like `<name>_other`** — we store the free text directly so new website submissions produce the same JSONB shape as the existing 99 rows. The schema builder (`schema-builder.ts`) needs a small tweak so that `allowOther: true` replaces the strict `z.enum(options)` constraint with `z.string()` (for `select`) or `z.array(z.string())` (for `multiselect`), since the user's text isn't in the enum.

### 2. Renderer changes

The dynamic form renderer under `src/components/forms/` needs to render an extra text input beneath a select/multiselect when `allowOther` is set. A canonical option labeled `"Other"` is *not* part of the enum list — the Other state is signaled by the text input being non-empty. For multiselect the user can pick canonical options AND type Other text; for select it's exclusive (picking an option clears the text and vice versa).

Out of scope for this spec: nicer UX polish like "show/hide the Other field only after user picks Other". First pass keeps the text input always visible when `allowOther: true`, labeled `"Other (please specify)"`.

### 3. Admin filter UI — "Other" bucket

Changes to `src/app/(dashboard)/admin/contacts/column-filter-popover.tsx`:

- Filter dropdown options come from `FIELD_REGISTRY.options` (the curated list), not from `dataOptions`.
- At the bottom of each dropdown, render a synthetic **"Other"** row.
- When `"Other"` is selected, the filter match predicate in `contacts-panel.tsx:177-191` includes rows where:
  - (select) the raw `answers[key]` is a non-empty string not present in `field.options`, OR
  - (multiselect) any element of `answers[key]` is not present in `field.options`.
- The `dataOptions` Map computation (lines 131-148) is deleted.
- The filter UI still selects/deselects multiple values at once (current behavior), but now "Other" is one of the selectable values alongside the canonical ones.

### 4. Enum consolidation

Every option enum currently scattered across:

- `src/lib/academy/forms/common/options.ts` (most of them)
- `src/lib/academy/forms/common/personal.ts` (`AGE_RANGES`, `GENDERS`)
- `src/lib/academy/forms/filmmaking.ts` (9 `FILMMAKING_*` + `INCOME_FROM_FILMING` constants)
- `src/lib/academy/forms/photography.ts` (none, reuses shared)
- `src/lib/academy/forms/freediving-modelling.ts` (11 `FREEDIVING_*` + related constants)
- `src/lib/academy/forms/internship.ts` (local `EDUCATION_LEVELS`, `CONTENT_CREATED`)

…moves into `src/lib/academy/forms/common/options.ts` only. The file is re-organized with comment-header sections:

```
// === SHARED — personal & background ===
AGE_RANGES, GENDERS, LANGUAGES

// === SHARED — health & fitness ===
FITNESS_LEVELS, HEALTH_CONDITIONS, HEALTH_CONDITIONS_FREEDIVING

// === SHARED — diving ===
DIVING_TYPES, CERTIFICATION_LEVELS_SCUBA, NUMBER_OF_DIVES,
DIVING_ENVIRONMENTS_SCUBA

// === SHARED — logistics ===
TIME_AVAILABILITY, TRAVEL_WILLINGNESS, BUDGETS, START_TIMELINES,
PLANNING_TO_INVEST, REFERRAL_SOURCES

// === SHARED — BTM Academy ===
BTM_CATEGORIES_MEDIA, BTM_CATEGORIES_FREEDIVING,
INVOLVEMENT_LEVELS, ONLINE_PRESENCE, LEARNING_APPROACHES

// === FILMMAKING-specific ===
FILMMAKING_EQUIPMENT, FILMMAKING_CONTENT_CREATED,
FILMMAKING_INCOME, FILMMAKING_GOALS,
FILMMAKING_LEARNING_ASPECTS, FILMMAKING_CONTENT_TO_CREATE,
FILMMAKING_MARINE_SUBJECTS

// === PHOTOGRAPHY-specific ===
PHOTOGRAPHY_EQUIPMENT, PHOTOGRAPHY_CONTENT_CREATED,
PHOTOGRAPHY_INCOME, PHOTOGRAPHY_GOALS,
PHOTOGRAPHY_LEARNING_ASPECTS, PHOTOGRAPHY_CONTENT_TO_CREATE

// === FREEDIVING-specific ===
FREEDIVING_CERTIFICATION_LEVELS, NUMBER_OF_SESSIONS,
PRACTICE_DURATION, PERFORMANCE_EXPERIENCE,
FREEDIVING_ENVIRONMENTS, LAND_MOVEMENT_SPORTS,
CHOREOGRAPHY_EXPERIENCE, FILMED_UNDERWATER,
FREEDIVING_LEARNING_ASPECTS, FREEDIVING_GOALS,
PROFESSIONAL_MATERIAL_PURPOSE

// === INTERNSHIP-specific ===
INTERNSHIP_EDUCATION_LEVELS, INTERNSHIP_CONTENT_CREATED,
INTERNSHIP_DIVING_ENVIRONMENTS,
CERTIFICATION_LEVELS_SCUBA_INTERNSHIP
  // TODO: unify with CERTIFICATION_LEVELS_SCUBA once partner A
  //       aligns the Google Form labels ("specify level below" vs
  //       "please specify level below:")
```

`filmmaking.ts`, `photography.ts`, `freediving-modelling.ts`, and `internship.ts` then import every enum they need from `./common/options` and define no option constants of their own. `MARINE_SUBJECTS` stays singular because filmmaking and photography use the same list once aligned.

Where a constant is shared (e.g., filmmaking's `learning_aspects` and photography's only differ by one word in "Business aspects of underwater filming/photography"), **do not** force a single constant — keep `FILMMAKING_LEARNING_ASPECTS` and `PHOTOGRAPHY_LEARNING_ASPECTS` as distinct constants so the program-specific wording stays accurate.

### 5. Per-program form code updates

The line-by-line enum diff lives in the companion diff report. Structural changes per program:

**Filmmaking (`filmmaking.ts`)**
- No field renames.
- Field type changes: `certification_level` → `multiselect`, `languages` → `multiselect`, `online_presence` → `multiselect`, `secondary_goal` → `select`.
- Add `allowOther: true` to: `diving_types`, `certification_level`, `diving_environments`, `equipment_owned`, `content_created`, `involvement_level`, `physical_fitness` (⚠ verify), `referral_source`, `languages`.

**Photography (`photography.ts`)**
- Same structural changes as filmmaking.
- Add `allowOther: true` to the same fields (photography DB has a `"VERY ACTIVE..."` free-text in `physical_fitness`, which confirms Other is allowed there).

**Freediving (`freediving-modelling.ts`)**
- Field type changes: `primary_goal` text→select, `secondary_goal` (new) text→select, `learning_approach` select→multiselect, `certification_level` select→multiselect, `languages` text→multiselect, `online_presence` select→multiselect, `land_movement_sports` text→select, `professional_material_purpose` text multiline→select.
- Uses its own `HEALTH_CONDITIONS_FREEDIVING` constant — the wording says "freediving" everywhere the others say "diving".
- Add `secondary_goal` field (missing from current code).

**Internship (`internship.ts`)**
- Field key renames in `FieldDefinition.name`: `hoped_gains`→`internship_hopes`, `azores_ties`→`accommodation_ties`, `why_good_candidate`→`candidacy_reason`.
- Field type changes: `certification_level` select→multiselect, `languages` text→multiselect.
- `age` is overridden to a `text` field *at the internship step level* — do not modify the shared `personalFields`, because filmmaking/photography/freediving still use the age range select.
- `current_occupation` is `required: true` at the internship level. In the shared `backgroundFields`, make it default `required: false` so the other 3 programs match their Google Forms.
- `filming_equipment` becomes `required: false` (optional in the Google Form).
- `nickname` becomes `required: false` (optional in all 4 Google Forms).
- Uses its own `INTERNSHIP_CONTENT_CREATED`, `INTERNSHIP_DIVING_ENVIRONMENTS`, `INTERNSHIP_EDUCATION_LEVELS`, `CERTIFICATION_LEVELS_SCUBA_INTERNSHIP`.

### 6. Field registry rewrite

`src/app/(dashboard)/admin/contacts/field-registry.ts` currently papers over the code/Google-Forms mismatch by merging every program's option list via `union(...)`. After alignment, most entries lose the `union(...)` and point to a single constant (the one that actually matches what's in the DB). Where a concept genuinely has different option lists per program (e.g., `certification_level` is `CERTIFICATION_LEVELS_SCUBA` for filmmaking/photography/internship, and `FREEDIVING_CERTIFICATION_LEVELS` for freediving), keep them as separate registry entries and rely on Phase B to canonicalize for cross-program filtering.

For now, a cross-program `certification_level` filter in the admin table will only filter within-program — filmmaking rows match scuba options, freediving rows match freediving options, and a user filtering for "Instructor" will match filmmaking rows but not freediving rows that picked `"Freediving Instructor"`. That's fine for Phase A; Phase B adds a canonical layer on top.

### 7. Remove `dataOptions` workaround

`contacts-panel.tsx:131-148` currently computes `dataOptions` from the live DB values every render. Delete that computation. Delete the `dataOptions` destructuring at line 117 and the reference at line 433 (`options={[...(dataOptions.get(field.key) ?? [])].sort()}`). Replace with:

```ts
options={[...field.options, "Other"]}
```

…where `"Other"` is the synthetic bucket. The filter match predicate in the `useMemo` at lines 176-191 gains an `if (values.includes("Other"))` branch that matches the anything-not-in-the-canonical-list case per field type.

### 8. Supabase migration

New file: `supabase/migrations/<timestamp>_normalize_application_answers.sql`.

**Scope** (string fields are `jsonb_set` + string comparison; array fields need `jsonb_array_elements_text` subqueries):

| Field | Storage | Change | Programs |
|---|---|---|---|
| `age` | string | `"54+"` → `"55+"` | filmmaking, photography, freediving |
| `time_availability` | string | `"…aproject…"` → `"…a project…"` | filmmaking, photography |
| `income_from_photography` | string | `"No, thats not my goal."` → `"No, that's not my goal."` | photography |
| `certification_level` | **string** (comma-joined!) | `"…please specify below:…"` → `"…please specify level below:…"` | filmmaking, photography — NOT internship (different wording) |
| `referral_source` | **array** | rejoin `["Social Media (Instagram", "Facebook", "etc.)"]` fragments into the single string `"Social Media (Instagram, Facebook, etc.)"` | all programs where it appears |

**Storage-shape note:** an earlier `jsonb_typeof` audit revealed that the Google Forms ingest script stored some multiselects as **strings** (comma-joined) and others as **arrays**:

- string-shaped: `certification_level`, `languages`, `time_availability`, `age`, `income_from_photography`
- array-shaped: `content_created`, `referral_source`, `diving_types`, `diving_environments`, etc.

The migration has to match each field's shape. No attempt is made in Phase A to *normalize* the shape (e.g., convert strings to arrays) — that's a larger change that would also affect the admin rendering code. Leave as-is.

**Safety:**

- Migration runs in a single transaction (Postgres migrations do by default).
- Each statement includes a `WHERE` clause that narrows to the specific program(s) and the specific old value, so it's idempotent.
- A companion `-- Verification query` block (commented-out SQL) at the bottom of the file lets you `\i migration.sql` + manually paste the verification queries to check before/after counts. Looks like:

```sql
-- Before applying:
-- SELECT program, answers->>'age', count(*) FROM applications
-- WHERE program IN ('filmmaking','photography','freediving')
--   AND answers->>'age' IN ('54+','55+')
-- GROUP BY 1,2;
```

**Local testing:**
Run `supabase db reset` (the user has a hook that automates this after migration changes). Then re-run the DB audit queries from today's session to confirm:
- Zero rows with `age = '54+'`
- Zero rows with `time_availability LIKE '%aproject%'`
- Zero rows with `income_from_photography = 'No, thats not my goal.'`
- Zero rows with `certification_level LIKE '%please specify below:%'` AND `NOT LIKE '%please specify level below:%'` for filmmaking/photography
- Zero rows with `referral_source` containing the split fragments

**Production deployment:**
After local verification, the user runs `supabase db push` to apply the same migration to the production DB. This is a one-way change — no `DOWN` migration is provided because restoring the typos serves no purpose, and the source data is the DB itself (no other upstream to reconcile with).

**New Google Forms submissions reintroducing typos:**
The Google Forms themselves still have the typos (unless partner A fixes them). Any new Google Forms submission imported into `applications.answers` would re-introduce `"aproject"`, `"54+"`, etc. Options for dealing with this:

1. User pings partner A to update the Google Forms to match the corrected code options. Best long-term.
2. Re-run the migration periodically as part of the Google Forms → DB ingestion pipeline.
3. Update the ingestion pipeline to apply the same normalization on write.

(3) is the most robust but out of scope here — the ingestion pipeline isn't part of this codebase as far as I've seen. For Phase A we ship option (1) as a follow-up task on the user and accept one-shot normalization for now.

### 9. Tests

- `schema-builder.test.ts` currently validates field definitions against Zod. Update the test fixtures to reference the new `allowOther` flag and the renamed internship fields.
- Add new cases to cover:
  - A select field with `allowOther: true` accepts a string not in the enum list.
  - A multiselect field with `allowOther: true` accepts an array containing both canonical and non-canonical strings.
  - The "Other" filter predicate in `contacts-panel` matches rows whose values fall outside the curated enum.
- No changes to the existing registration/auth test suites — those don't touch forms.
- E2E: skip. Playwright tests today don't cover the admin contacts table, and adding them is out of scope here.

### 10. Admin UX verification checklist (post-implementation)

Before marking Phase A done, manually verify in the dev server:

- [ ] Open `/admin/contacts`, add a column with a dropdown filter (e.g., Professional Status, Certification Level, Budget). Dropdown options are the curated set from `FIELD_REGISTRY`, with an `"Other"` entry at the bottom.
- [ ] Selecting `"Other"` filters to rows with free-text or legacy values.
- [ ] Filtering by a canonical value (e.g., `"Moderate budget (1,000 - 3,000 €/USD)"`) catches every row with that exact string.
- [ ] After the migration, the Age filter dropdown no longer shows `"54+"`; filtering by `"55+"` catches every previously-"54+" row.
- [ ] Filtering by the photography `"No, that's not my goal."` catches the formerly-`"No, thats not my goal."` rows.
- [ ] The internship column for age shows the numeric values unchanged (`"21"`, `"22"`, …). Filtering by `18-24` **does NOT** match these yet — that's Phase B.

## Decisions taken

- **`allowOther`** is a field-def flag, not a convention (no `<name>_other` side field). Matches Google Forms storage.
- **Typo corrections** applied to both code and DB; user will ping partner A to update the Google Forms.
- **Age** final value is `"55+"`, not `"54+"`.
- **`BTM_CATEGORIES_MEDIA`** (5 options, filmmaking+photography) stays separate from **`BTM_CATEGORIES_FREEDIVING`** (3 options with the `"ASPIRING PROFESSIONAL (Actor/model aiming to expand skill-set)"` label).
- **`CERTIFICATION_LEVELS_SCUBA_INTERNSHIP`** is a separate constant; noted as a TODO for partner A to unify.
- **`current_occupation`** default optional in `backgroundFields`, internship overrides to required.
- **`nickname`** and `filming_equipment` (internship) become optional.
- **Phase B (filter normalization)** is out of scope — separate spec later.

## Risks & caveats

1. **Extractor fidelity.** The Google Forms were read by a small LLM via WebFetch. It probably missed some `"Other"` markers and may have silently normalized some typos. The diff report has a ⚠ verify list flagging the specific items; before merging the Phase A PR, open each live Google Form and confirm the edge cases. If any extracted option text is wrong, the form-code enum will be wrong and new submissions from the website will drift. A 15-minute eyeball pass prevents that.
2. **Google Forms still authoritative.** Partner A hasn't updated the Google Forms to match the aligned code, so new Google Forms submissions could reintroduce pre-migration typos. Follow-up tasks: (a) ping partner A with the list of label changes, (b) once Google Forms are updated, re-run the migration on any new typo'd rows, (c) later, consider adding normalization to the ingestion pipeline.
3. **JSONB shape inconsistency** — some multiselects are stored as strings, some as arrays. Phase A does not touch this. The migration respects current shapes. If Phase B ends up needing consistent shapes, plan a separate shape-normalization migration then.
4. **Internship `age` field split** — because internship takes a raw number and the other 3 programs take a range, we override `age` within `internshipPersonalStep`. Two sources of truth for the same field name is usually a smell, but here it's genuinely program-specific per the Google Forms and not worth forcing a shared representation. Phase B's filter-side canonicalization turns it into a uniform bucket at display/filter time.

## Out of scope — Phase B preview

Phase B gets its own spec after Phase A ships. It will cover:

- Read-time filter canonicalization for concepts that genuinely differ across programs:
  - Internship numeric ages → AGE_RANGES bucket containment (`21` ∈ `"18-24"`).
  - `CERTIFICATION_LEVELS_SCUBA` ↔ `FREEDIVING_CERTIFICATION_LEVELS` → a common skill tier for cross-program filter matching.
  - Remaining legacy values the migration didn't catch (e.g., freediving's single `"SSI level 2"` row).
- Possibly a computed "skill level" canonical dimension derived from `btm_category` + `involvement_level` + experience-duration fields.
- No DB writes — all normalization happens at filter-match time, so the raw `answers` stays as-is.

## Links & references

- Companion diff: `docs/superpowers/specs/2026-04-11-forms-alignment-diff.md`
- Live Google Forms:
  - Filmmaking: `https://docs.google.com/forms/d/e/1FAIpQLSd5L8w-ZTIy2l4XkvFrL9arfL2c7mCJi2wVEfWDNAjPq3lNjQ/viewform`
  - Photography: `https://docs.google.com/forms/d/e/1FAIpQLSeRbgBIGnIZ6IkWnDWW_8pGVX83Bew_YJLMRRlXWvBUPkSbhA/viewform`
  - Freediving: `https://docs.google.com/forms/d/e/1FAIpQLSf3CjCvUYGlHfzU8ifEqw7S_E0hw2et4T-tydbiG1EnLaypcA/viewform`
  - Internship: `https://docs.google.com/forms/d/e/1FAIpQLSdESHp9FnmsAhjKeeVB7dwTtzOPzxd0Tm0yVsAQlN3Wcxk5mw/viewform`
- Code hotspots referenced by this spec:
  - `src/lib/academy/forms/types.ts`
  - `src/lib/academy/forms/common/options.ts`
  - `src/lib/academy/forms/{filmmaking,photography,freediving-modelling,internship}.ts`
  - `src/lib/academy/forms/schema-builder.ts`
  - `src/app/(dashboard)/admin/contacts/field-registry.ts`
  - `src/app/(dashboard)/admin/contacts/contacts-panel.tsx` (lines 131-148 deletion, 177-191 Other predicate)
  - `src/app/(dashboard)/admin/contacts/column-filter-popover.tsx`
