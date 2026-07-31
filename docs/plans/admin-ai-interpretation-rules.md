# Admin AI: interpretation-rule fixes (price floor · prospecting · "at least N")

Plan authored by Fable, Jul 30 2026, from a live incident the same day.
Implementer: execute exactly; where this plan and the codebase disagree, STOP
and report — do not improvise. Read `docs/admin-ai-handbook.md` and
`docs/admin-ai-eval-contract.md` first (mandatory; short). Work on branch
`feat/admin-ai-interpretation-rules` (already created). Do NOT commit, do NOT
push, do NOT run the live eval (`RUN_ADMIN_AI_EVAL=1 …` — costs money; the
orchestrating session runs it), do NOT touch `.env*` or `.admin-ai-debug/`
(PII). Unit tests (`npx vitest run <file>`) are free — run them.

## The incident (why each change exists)

Owner question (verbatim, typos included — it becomes eval Q12):

> I look for a canditate who could join coral catch on a price of 3000EUR. who
> is already filming a bit, not necessarly professional yet, but not a beginner
> either. good diving, bouyancy of at least 7-8. avaiable this year to travel.
> focus on conservation, ideally wants to work in that field.

What went wrong (all verified against the persisted answer + code):

1. **Price floor became "exactly 3000".** The planner correctly emitted
   `budgetMin: 3000`, but (a) `planToStructuredFilters` (orchestrator.ts)
   renders it `{field:"budget", op:"eq", value:"3000"}`, and that string is
   embedded in the synthesis prompt's `queryPlan`, so the model verbalized
   "exactly 3000", matched the "Moderate budget (1,000 - 3,000 €/USD)" bracket
   as THE match and treated higher (Advanced/Professional) budgets as
   *concerns* — inverted; and (b) `budgetValueMeetsMinimum`
   (hard-constraints.ts) requires a dash-range bracket's MINIMUM ≥ the asked
   floor, so Moderate-bracket contacts were deterministically dropped and only
   re-entered via the rescue scan.
2. **All 10 shortlisted contacts already carry a '26 Coral Catch' tag.** The
   synthesis system prompt (prompt.ts) says a named program's tags are "the
   authoritative cohort marker: only contacts carrying a tag in that category
   qualify" — roster semantics with no prospecting concept. The owner's intent
   for "who could join X": find NEW candidates, i.e. contacts NOT yet tagged in
   that category.
3. **"buoyancy of at least 7-8" grounded as `in ["7","8"]`** — on the 1–10
   rating scale that wrongly excludes 9 and 10 (the eventual #1 candidate has
   buoyancy 10 and was dropped, then rescued).

Owner decisions (Andrei, Jul 30 2026 — these are settled, do not re-litigate):

- **Price of a trip/program is an affordability FLOOR.** A budget bracket
  qualifies when the asked price fits at-or-below the bracket's TOP (its max).
  A budget above the price is a positive, never a concern. Missing budget data
  keeps going through the rescue path (eval contract rule 4, unchanged).
- **Prospecting questions exclude ALL statuses** in the target tag category —
  Interested, Potential Candidate, Joining, AND Declined ("they currently
  don't have any of these tags"). Deterministic, disclosed, never rescued.
- **Only the named category is excluded** — e.g. contacts tagged only in
  "26 Artist Residency Banka Coral Eye / Siladen" remain eligible for a
  "coral catch" prospecting search.

Handbook doctrine that binds this work: code enforces what prompts request;
failure direction is inclusion; every exclusion is disclosed in `uncertainty`;
prompt edits are batched (each system-prompt change is a cache-cold event);
live failures become eval questions with runtime-derived truth.

---

## Change 1 — budget range semantics (code)

**File:** `src/lib/admin-ai/hard-constraints.ts`, `budgetValueMeetsMinimum`.

The dash-range branch currently returns `Math.min(...amounts) >= minimum`.
Change to `Math.max(...amounts) >= minimum`. Update the surrounding comment to
state the owner rule: a range bracket qualifies when the asked floor fits
inside or below the bracket's top ("Moderate (1,000 - 3,000)" passes a 3000
floor; a bracket entirely below the floor fails). Negative-vocabulary values
("under X", "below X", "limited", "no financial means") must STILL fail — do
not touch that guard. Do not change the `over/above/more than` branch or the
plain `some(amount >= minimum)` fallback.

**Tests:** `src/lib/admin-ai/hard-constraints.test.ts` — extend the existing
`budgetValueMeetsMinimum` cases. First read the real budget option strings via
the field registry (`src/app/(admin)/admin/contacts/field-registry.ts`, budget
entry) and use those verbatim strings in tests. Cover at minimum: the
1,000–3,000 bracket vs floor 3000 (now true), the same bracket vs floor 3001
(false), a 3,000–10,000 bracket vs 3000 (true), a below-1,000 / "less than"
option vs 3000 (false), "under 3k" free text (false), missing/garbage (false).

## Change 2 — honest plan representation (code)

**Files:** `src/lib/admin-ai/orchestrator.ts` (`planToStructuredFilters`),
`src/lib/admin-ai/schemas.ts` (`adminAiFilterOpSchema`),
`src/types/admin-ai.ts` (`AdminAiStructuredFilter` op union).

- `planToStructuredFilters`: the budget entry becomes
  `{ field: "budget", op: "gte", value: String(plan.budgetMin) }`.
- Widen the op enum/union to include `"gte"` and `"excludes"` (the latter used
  by Change 3). Widening is backward-compatible with persisted `query_plan`
  JSON; do NOT remove existing ops.
- Grep for consumers that switch on `op` (UI rendering of the query plan,
  `queryAdminAiContactFacts` / payload-inspect helpers, tests). If a consumer
  exhaustively switches and would throw on unknown ops, handle the two new ops
  there (display: `gte` → "≥", `excludes` → "excludes"). Note: the existing
  tagConstraint display entry already pushes a tag CATEGORY name into `field`,
  which is outside `ADMIN_AI_STRUCTURED_FIELDS` — if you find a runtime path
  that validates display filters with `adminAiStructuredFilterSchema` and would
  now reject, STOP and report rather than silently loosening the schema.

**Tests:** orchestrator/schema unit tests asserting the `gte` shape for a
budget-bearing plan.

## Change 3 — prospecting mode (planner + code + prompt + disclosure)

### 3a. Planner contract

**File:** `src/lib/admin-ai/schemas.ts` — `plannerOutputSchema` gains:

```ts
// Prospecting: the question asks to FIND NEW candidates for a program/cohort
// ("who could join X", "find candidates for X"). Contacts ALREADY tagged in
// this category (ANY status, including Declined — owner decision Jul 30 2026)
// are excluded deterministically and never rescued: being in the pipeline is
// definitive. Mutually exclusive with tagConstraint on the same category.
prospectingCategory: z.string().nullable().default(null),
```

**File:** `src/lib/admin-ai/constraint-planner.ts`:

- Add `"prospectingCategory": "string" | null` to the JSON contract line in
  `buildPlannerSystemPrompt`.
- Add one prompt rule (keep the existing rules verbatim; this is an addition):
  - Prospecting rule: when the question asks to FIND / source / discover NEW
    candidates FOR a program, trip, or cohort — "who could join X", "find a
    candidate for X", "who might qualify for X", "who should we approach for
    X" — set `prospectingCategory` to the catalog tag category that tracks X,
    copied VERBATIM from the catalog. Do NOT set `tagConstraint` for that
    category. Contrast: questions about the EXISTING pipeline — "who is
    interested in X", "who declined X", "list the X candidates" — use
    `tagConstraint`, never `prospectingCategory`. Never set both for the same
    category.
- `validatePlan`: ground `prospectingCategory` against `catalog.tagCategories`
  (trim/case-insensitive → canonical casing, same pattern as the tag/program
  grounding). Unknown → set null + push
  `prospecting category '<name>' (unknown)` to `droppedParts`. If BOTH
  `tagConstraint` and a grounded `prospectingCategory` name the same category,
  keep `tagConstraint`, null out `prospectingCategory`, and push a disclosure
  (`prospecting for '<cat>' ignored: question also reads as a roster of that
  category`) — inclusion is the safer failure direction.
- `planHasConstraints`: include `plan.prospectingCategory !== null`.

### 3b. Deterministic exclusion

**File:** `src/lib/admin-ai/hard-constraints.ts`, `applyPlannedConstraints` +
`PlannedFilterResult`:

- Add `droppedByProspecting: string[]` to `PlannedFilterResult`.
- Apply prospecting AFTER tag/program constraints and BEFORE budget/field
  constraints: drop every record where `recordHasTagInCategory(record,
  plan.prospectingCategory)` (the existing helper; ANY tag in the category,
  any status). Sequential application means these ids never reach the
  budget/field stages.

**File:** `src/lib/admin-ai/orchestrator.ts`:

- `buildPlannerPrefilter`: the rescue pool remains EXACTLY
  `droppedByField + droppedByBudget` — prospecting drops must NOT enter it
  (add a comment saying so; this mirrors program drops). Add the count to the
  `metadata.planner` block alongside `droppedByTag` etc.
- `disclosePlannerPrefilter`: when `plan.prospectingCategory` is set and
  `applied.droppedByProspecting.length > 0`, append (matching house style):
  `Prospecting: ${n} contact(s) already tagged in '${category}' excluded — the
  question asks for new candidates; ask for the '${category}' roster to see
  the existing pipeline.`
- `planToStructuredFilters`: when set, push
  `{ field: plan.prospectingCategory, op: "excludes", value: [] }` (mirrors
  the tagConstraint display entry's category-as-field pattern).

**Tests:** `hard-constraints.test.ts` — prospecting drops tagged records of
EVERY status incl. Declined-only; untagged records pass; drops land in
`droppedByProspecting` only. `constraint-planner.test.ts` — grounding,
unknown-drop disclosure, same-category conflict (tagConstraint wins),
`planHasConstraints`. Orchestrator tests — rescue pool excludes prospecting
drops; disclosure string appears; display filter shape.

### 3c. Synthesis prompt (BATCH with Changes 4+5 — single cache-cold event)

**File:** `src/lib/admin-ai/prompt.ts`, `buildAdminAiSystemPrompt`. Replace the
single "named program → only tagged contacts qualify" sentence with two rules,
and keep every other sentence byte-identical:

- Roster rule (narrowed scope): "When the question asks about the EXISTING
  members, status, or roster of a named program, trip, or cohort ('who is
  interested in X', 'who declined X', 'list the X candidates'), tags in the
  matching tag category are the authoritative cohort marker: only contacts
  carrying a tag in that category qualify. Negative statuses such as
  `Declined` do not count as interested or potential."
- Prospecting rule: "When the question asks to FIND NEW candidates for a named
  program, trip, or cohort ('who could join X', 'find candidates for X'), the
  supplied cards have ALREADY been filtered to contacts not yet tagged in that
  category. Judge fit from their profile evidence. Never treat the absence of
  that category's tag as a concern, and never require a tag the queryPlan does
  not require."

## Change 4 — "at least N" on numeric rating scales (planner prompt, batched)

**File:** `src/lib/admin-ai/constraint-planner.ts`, `buildPlannerSystemPrompt`
— one added rule next to the existing multi-option rule:

- Numeric-scale rule: for a field whose options form a numeric scale (e.g.
  ratings "1"–"10"), a stated minimum — "at least N", "N+", "N or
  above/better", including a hedged minimum like "at least 7-8" whose minimum
  is the LOWER number — grounds EVERY option ≥ that minimum, listed verbatim
  as an array (e.g. "at least 7" → `["7","8","9","10"]`). A stated maximum
  grounds every option ≤ it. Emitting only the literally mentioned numbers
  silently narrows the cohort.

No code change: multi-value grounding + `in` application already exist.

**Tests:** `constraint-planner.test.ts` prompt-content assertion (follow the
file's existing style for prompt-text tests, if any; otherwise skip — the live
eval asserts behavior).

## Change 5 — synthesis business semantics (prompt.ts, same batch as 3c)

Add to `buildAdminAiSystemPrompt` base rules:

- "The queryPlan's structuredFilters were already applied by code before you
  received these cards; the 'Applied filter' lines in `uncertainty` are the
  authoritative record. Do not re-apply, tighten, or reinterpret them — in
  particular, never convert a minimum (op `gte`) into an exact match. Never
  write your own 'Applied filter' lines."
- "When the question states the price or cost of a trip or program, that price
  is an affordability floor for candidates: any candidate whose stated budget
  reaches or exceeds it qualifies fully; a budget above the price is a
  positive signal, never a concern; only a budget strictly below the price is
  a mismatch."

**Tests:** `prompt.test.ts` — follow existing prompt-content test style.

## Change 6 — eval Q12 + docs

**File:** `scripts/admin-ai-eval.test.ts`:

- Append `"prospecting-price"` to `QUESTION_ORDER`.
- New `it("prospecting-price: …")` block, timeout 600_000, modeled on
  `qualifier-trap`/`program-cohort`. Question = the owner-verbatim text quoted
  at the top of this plan (keep the typos).
- Runtime-derived sets (never hardcoded): `tagged` = ids of records with ANY
  tag in `CORAL` (use `tagsInCategory(record, CORAL).length > 0` via the
  file's `idsMatching` helper); `expectedBuoyancy` = the buoyancy_skill
  registry options filtered to `Number(o) >= 7` (derive via
  `getFieldEntry("buoyancy_skill")` options, same runtime-truth discipline as
  Q11's AGE_RANGES).
- Hard assertions:
  1. `out.diagnostics.plan?.prospectingCategory === CORAL`.
  2. `out.diagnostics.plan?.budgetMin === 3000`.
  3. The plan's `fieldConstraints` entry for `buoyancy_skill` exists and its
     value-set equals `expectedBuoyancy` (order-insensitive).
  4. `unionIds(out.response)` ∩ `tagged` = ∅ (report violators in
     `forbiddenViolations`).
  5. `out.diagnostics.rescuedIds` ∩ `tagged` = ∅ (prospecting drops are never
     rescued).
  6. `out.diagnostics.prefilteredCount <= records.length - tagged.length`.
- NOT asserted (ranked question, not `enumerationOnly` — same reasoning as
  program-cohort's long comment): recall, shortlist non-emptiness, judgment
  quality. `truthIds: []`, `truthCount: null`, `recall: null`,
  `shortlistPrecision: null`, `expectEmpty: null`. Advisory strings: "budget
  above the price must never appear as a concern (judgment — check the JSON by
  eye)", "shortlist should be non-empty if untagged qualifying contacts
  exist".

**File:** `docs/admin-ai-eval-contract.md` — add row 12 to the table (key
`prospecting-price`, the product rules: prospecting excludes the target
category's taggees any-status; price = affordability floor with bracket-top
semantics; "at least N" grounds the full ≥N option set). Amend standing rule 7
to record the bracket-top decision ("Andrei owner-approved 2026-07-30"), add a
standing rule 11 for prospecting, and update the "11 questions" phrasing (11 →
12) in the header/run notes.

**File:** `docs/admin-ai-handbook.md` — surgical updates only: pipeline
diagram step 1/2 mention `prospectingCategory` + never-rescued exclusion; §4
"9 questions"/"11 questions" counts → 12 where they appear; one line in §3
noting the Jul 30 incident class (pipeline-taught misreading: the displayed
`eq` plan was fed to the model) if a natural spot exists — do not restructure
the doc.

## Order of work, and gates

1. Changes 1–3b (code) + their unit tests. Gate: `npx tsc --noEmit`, targeted
   `npx vitest run src/lib/admin-ai/hard-constraints.test.ts
   src/lib/admin-ai/constraint-planner.test.ts src/lib/admin-ai/orchestrator.test.ts
   src/lib/admin-ai/schemas.test.ts` (whichever exist), `npx eslint` on touched
   files.
2. Changes 3c+4+5 (all prompt edits in one pass) + prompt tests.
3. Change 6 (eval + docs). The eval file must TYPE-CHECK and collect, but do
   NOT execute it (`RUN_ADMIN_AI_EVAL` stays unset in anything you run).
4. Full `npm run test:unit` once at the end.

Report back: files touched, test results, anything that deviated from this
plan, and any place you had to make a judgment call.
