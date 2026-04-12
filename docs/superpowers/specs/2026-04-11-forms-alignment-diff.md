# Forms Alignment Diff — Code vs Google Forms

**Source of truth:** the 4 live Google Forms written by partner A (extracted via WebFetch 2026-04-11).
**Target:** `src/lib/academy/forms/*.ts` — what the website renders to new applicants.
**Goal of this doc:** show every difference between the two so we can align them before touching code. After alignment, the `FIELD_REGISTRY` filter dropdowns in the admin contacts table can use these curated option lists directly and the `dataOptions` workaround at `contacts-panel.tsx:131` can be deleted.

This doc is **NOT** a plan to migrate existing DB rows. Storage stays as-is; the form-code changes only affect **future submissions** from the website. Legacy/mismatched DB values will be handled in a follow-up "filter normalization" layer (Phase B).

---

## Extraction caveats — verify manually before merging

The Google Forms were extracted by a small LLM reading the form HTML. The extractor tends to miss two things, so flag these for eyeball verification:

- [ ] **"Other" options (free-text input).** Google Forms lets authors add an "Other" option to multiple-choice/checkbox questions. The extractor often fails to list it. The DB gives strong hints where one exists (any free-text answer that isn't in the option list means "Other" was used). Evidence in the DB: free-text answers in `involvement_level` (filmmaking/photography), `physical_fitness` (photography has `"VERY ACTIVE AND REGULAR EXERCISE.REMISSION FROM CANCER."`), `referral_source` (lots across all programs), `land_movement_sports` (freediving, likely).
- [ ] **Small typos the LLM may have silently corrected.** Example: filmmaking `time_availability` is stored in the DB 30 times as `"2-3 entire weeks at a time for a workshop, aproject or individual training"` (note `aproject`, no space). The extraction returned `"a project"` (with space). Either the Google Form has been fixed recently or the LLM auto-corrected. **Please open the live filmmaking form and confirm which version is there now.** If it's still `aproject`, we keep the typo in the code. If it's been fixed, we use the corrected version and rely on filter normalization to bucket the old DB values.
- [ ] **"55+" vs "54+"** for age ranges. Extractor returned `"54+"` for filmmaking/photography/freediving. DB confirms `"54+"` (present in data). Current form code says `"55+"`. Assume `"54+"` is correct, but please confirm it's literally what partner A wrote in the forms (it's unusual).
- [ ] **Internship: the extractor labeled several "Other" options as `[Other]` in its output — photography and filmmaking had no such markers. Please confirm whether filmmaking and photography sections really lack "Other" on questions like `equipment_owned`, `content_created`, `diving_types`, `diving_environments`, `certification_level`, `referral_source`. DB evidence suggests several of them *do* accept Other.**

Where a caveat might flip the conclusion, the change is marked **⚠ verify**.

---

## Global findings (apply to every program)

### Field type changes

| Field | Current code type | Google Forms type | Action |
|---|---|---|---|
| `certification_level` | `select` (single) | Checkboxes (multi) | Change to `multiselect` in all 4 programs. DB already stores multi-values comma-joined. |
| `languages` | `text` | Checkboxes (multi) | Change to `multiselect` with Other support. DB stores as array. |
| `involvement_level` (f, p) | `select` | Multiple choice + Other | Keep `select` but add Other support (see caveat). |
| `online_presence` (f, p, fd) | `select` | Checkboxes | Change to `multiselect` in all 3 programs. DB stores as array. |
| `secondary_goal` (all enum-having programs) | `text` | Multiple choice | Change to `select` using same options as primary_goal. |
| `primary_goal` (freediving) | `text` | Multiple choice | Change to `select` (see freediving section). |
| `learning_approach` (freediving) | `select` | Checkboxes | Change to `multiselect`. |
| `professional_material_purpose` (freediving) | `text multiline` | Multiple choice | Change to `select`. |
| `land_movement_sports` (freediving) | `text` | Multiple choice + Other | Change to `select` (see freediving section). |
| `age` (internship) | `select` (AGE_RANGES) | Short answer (numeric) | Change internship's age to `text` — it's the only program that takes a raw number. |

### Fields currently marked `required: true` in code that are **optional** in Google Forms

- `nickname` — optional in all 4 Google Forms.
- `online_links` — optional in all 4 (matches code already).
- `current_occupation` — optional in filmmaking/photography; **required in internship**. Code currently has it required everywhere via `backgroundFields`. Split or override.

### Options consolidation (your requirement)

Move **every** option constant into `src/lib/academy/forms/common/options.ts`, split with comment headers. Delete the program-specific `export const FILMMAKING_*` / `FREEDIVING_*` declarations that currently live inside `filmmaking.ts` and `freediving-modelling.ts`. Proposed organization inside `options.ts`:

```
// ============================================================
// SHARED — personal / background
// ============================================================
AGE_RANGES, GENDERS, LANGUAGES

// ============================================================
// SHARED — health & fitness
// ============================================================
FITNESS_LEVELS, HEALTH_CONDITIONS_DIVING, HEALTH_CONDITIONS_FREEDIVING

// ============================================================
// SHARED — diving (filmmaking + photography + internship)
// ============================================================
DIVING_TYPES, CERTIFICATION_LEVELS_SCUBA, NUMBER_OF_DIVES,
DIVING_ENVIRONMENTS_SCUBA

// ============================================================
// SHARED — logistics
// ============================================================
TIME_AVAILABILITY, TRAVEL_WILLINGNESS, BUDGETS, START_TIMELINES,
PLANNING_TO_INVEST, REFERRAL_SOURCES

// ============================================================
// SHARED — BTM Academy
// ============================================================
BTM_CATEGORIES_MEDIA  // filmmaking + photography (same 5)
BTM_CATEGORIES_FREEDIVING  // 3 different labels

INVOLVEMENT_LEVELS  // same set for filmmaking/photography
ONLINE_PRESENCE  // same 5 for all 3 programs with btm_category

// ============================================================
// PROGRAM-SPECIFIC — FILMMAKING
// ============================================================
FILMMAKING_EQUIPMENT, FILMMAKING_CONTENT_CREATED,
FILMMAKING_INCOME, FILMMAKING_GOALS,
FILMMAKING_LEARNING_ASPECTS, FILMMAKING_CONTENT_TO_CREATE,
FILMMAKING_LEARNING_APPROACHES, FILMMAKING_MARINE_SUBJECTS

// ============================================================
// PROGRAM-SPECIFIC — PHOTOGRAPHY
// ============================================================
PHOTOGRAPHY_EQUIPMENT, PHOTOGRAPHY_CONTENT_CREATED,
PHOTOGRAPHY_INCOME, PHOTOGRAPHY_GOALS, …

// ============================================================
// PROGRAM-SPECIFIC — FREEDIVING
// ============================================================
FREEDIVING_CERTIFICATION_LEVELS, NUMBER_OF_SESSIONS,
PRACTICE_DURATION, PERFORMANCE_EXPERIENCE,
FREEDIVING_ENVIRONMENTS, LAND_MOVEMENT_SPORTS,
CHOREOGRAPHY_EXPERIENCE, FILMED_UNDERWATER,
FREEDIVING_LEARNING_ASPECTS, FREEDIVING_GOALS,
PROFESSIONAL_MATERIAL_PURPOSE

// ============================================================
// PROGRAM-SPECIFIC — INTERNSHIP
// ============================================================
INTERNSHIP_EDUCATION_LEVELS, INTERNSHIP_CONTENT_CREATED,
INTERNSHIP_DIVING_ENVIRONMENTS
```

Many "program-specific" groups turn out to be shared once aligned (e.g., `INVOLVEMENT_LEVELS`, `ONLINE_PRESENCE`, `LEARNING_APPROACHES`, `MARINE_SUBJECTS`, `LEARNING_ASPECTS` are all the same between filmmaking and photography in the Google Forms). I've kept them distinct above for safety; we can collapse duplicates once confirmed.

---

## FILMMAKING

**Form code file:** `src/lib/academy/forms/filmmaking.ts`
**Google Form URL:** `https://docs.google.com/forms/d/e/1FAIpQLSd5L8w-ZTIy2l4XkvFrL9arfL2c7mCJi2wVEfWDNAjPq3lNjQ/viewform`

### Field key renames
None. All DB keys match form code.

### Field type changes
- `certification_level`: `select` → `multiselect`
- `languages`: `text` → `multiselect`
- `online_presence`: `select` → `multiselect`
- `secondary_goal`: `text` → `select` (same options as primary_goal)
- `involvement_level`: keep `select`, add Other support ⚠ verify

### Enum option diffs

**`age`** (`AGE_RANGES` in `common/personal.ts`)
```diff
- "Under 18",
  "18-24",
  "25-34",
  "35-44",
  "45-54",
- "55+",
+ "54+",
```

**`gender`** — ✓ matches Google Form.

**`languages`** (new enum `LANGUAGES`)
```
"English", "Spanish", "French", "German"
```
Add Other support ⚠ verify.

**`physical_fitness`** (`FITNESS_LEVELS`) — ✓ matches (5 options, identical text).

**`health_conditions`** (`HEALTH_CONDITIONS`) — ✓ matches filmmaking/photography/internship.
  Note: freediving uses a *different* wording, see freediving section.

**`diving_types`** (`DIVING_TYPES`)
```diff
  "Recreational Scuba diving",
  "Technical Scuba diving",
  "Rebreather diving",
  "Freediving",
  "Snorkeling",
  "Neither, but interested in learning",
```
Matches Google Form. Add Other support ⚠ verify.

**`certification_level`** (currently `CERTIFICATION_LEVELS`, rename → `CERTIFICATION_LEVELS_SCUBA`)
```diff
- "None",
- "Open Water (OW)",
- "Advanced Open Water (AOW)",
+ "No certification yet",
+ "Open Water",
+ "Advanced Open Water",
  "Rescue Diver",
  "Divemaster",
  "Instructor",
  "Technical Diving certification",
- "Certified Freediver, please specify below"
+ "Certified Freediver, please specify level below:"
```
Plus: change field type to `multiselect`, add Other support.

**`number_of_dives`** (`NUMBER_OF_DIVES`) — ✓ matches.

**`diving_environments`** (`DIVING_ENVIRONMENTS`)
```diff
  "Tropical Reefs",
  "Cold water",
  "Deep diving",
  "Night diving",
- "Cave / Wreck diving",
+ "Cave/Wreck diving",
- "Other",
```
Remove the literal `"Other"` string — Google Form doesn't use it as an explicit enum entry, and if Other-as-freeform is used, it's handled via the checkbox-Other mechanism. ⚠ verify.

**`equipment_owned`** (currently `FILMMAKING_EQUIPMENT_OWNED`, rename → `FILMMAKING_EQUIPMENT`)
```diff
- "Camera",
- "Underwater housing",
- "Video lights",
- "Wide-angle lens",
- "Macro lens",
- "Drone",
- "Gimbal / stabilizer",
- "Editing software",
+ "No equipment yet",
+ "Action camera (GoPro, Osmo, Insta360, etc)",
+ "Compact camera with housing",
+ "DSLR/Mirrorless with housing",
+ "Professional video camera",
+ "Lighting equipment",
```
Complete replacement. ⚠ verify whether Google Form also has Other.

**`planning_to_invest`** (`PLANNING_TO_INVEST`) — ✓ matches.

**`years_experience`** (`YEARS_EXPERIENCE`)
```diff
  "None",
  "Less than 1 year",
- "1-2 years",
+ "1-3 years",
  "3-5 years",
- "5+",
+ "5+ years",
```

**`content_created`** (currently `FILMMAKING_CONTENT_CREATED`)
```diff
  "None yet, excited to start",
  "Personal vacation videos",
  "Social media content",
  "Documentary style",
  "Commercial work",
- "Scientific / research documentation",
+ "Scientific/Research documentation",
- "Conservation stories",
- "Other"
```

**`btm_category`** (`BTM_CATEGORIES`) — ✓ matches, keep all 5.

**`involvement_level`** (`INVOLVEMENT_LEVELS`)
```diff
  "Complete beginner",
  "Hobby only",
- "Part-time",
- "Full-time",
+ "Part-time professional",
+ "Full-time professional",
- "Conservation / Scientific work",
+ "Conservation/Scientific work",
```
Add Other support (DB shows many free-text responses).

**`online_presence`** (currently `FILMMAKING_ONLINE_PRESENCE`; unify with `ONLINE_PRESENCE`)
```diff
- "None",
- "Personal social media only",
- "Dedicated filming social media",
- "Website / portfolio",
- "Multiple platforms",
+ "Active social media",
+ "Personal website",
+ "Professional portfolio",
+ "Client base",
+ "None of the above",
```
Also change field type to `multiselect`. This is the same list as photography and freediving — collapse to a shared `ONLINE_PRESENCE`.

**`income_from_filming`** (`INCOME_FROM_FILMING`)
```diff
- "No, that's not my goal",
+ "No, that's not my goal.",
- "No, not yet",
+ "No, not yet.",
- "Occasional (few projects per year)",
+ "Occasionally (few projects per year)",
  "Regular part-time income",
  "Full-time income",
  "Prefer not to say"
```
(Period additions, "Occasional" → "Occasionally".)

**`primary_goal`** (currently `FILMMAKING_PRIMARY_GOALS`)
```
"Learn basics of underwater filming as a hobby",
"Improve content creation for social media",
"Transform hobby into professional career",
"Enhance existing professional skills",
"Document marine conservation/research",
```
Matches current code ✓.

**`secondary_goal`** — currently a free text field in code. Change to `select` with the exact same 5 options as `primary_goal`.

**`learning_aspects`** (currently `FILMMAKING_LEARNING_ASPECTS`)
```diff
- "Basic equipment setup & operation",
+ "Basic equipment setup and operation",
- "Camera settings & techniques",
+ "Camera settings and techniques",
  "Lighting techniques",
  "Marine life behavior understanding",
- "Storytelling & content planning",
+ "Storytelling and content planning",
- "Post-production & editing",
+ "Post-production and editing",
  "Business aspects of underwater filming",
- "Client relations & project management",
+ "Client relations and project management",
  "Conservation documentation",
- "Other"
```
Replace all `&` with `and`, remove the literal `"Other"` enum entry.

**`content_to_create`** (currently `FILMMAKING_CONTENT_TO_CREATE`)
```diff
- "Personal / travel memories",
+ "Personal/travel memories",
  "Social media content",
  "Documentary style films",
- "Commercial / advertising content",
+ "Commercial/advertising content",
- "Scientific / research documentation",
+ "Scientific/research documentation",
  "Conservation stories",
- "Other"
```

**`learning_approach`** (currently `FILMMAKING_LEARNING_APPROACHES`)
```diff
- "Group workshops (within a group of approx. 10 people)",
+ "Group workshops (within a group of approx. 10 persons)",
- "Small group workshop (within a group of approx. 4 people)",
+ "Small group workshop (within a group of approx. 4 persons)",
  "One-on-one mentorship",
  "Mixed approach (combination of group and individual)",
- "Project-based learning (Within a BTM project)",
+ "Project-based learning (within a BTM project)",
```
("people" → "persons", capital "Within" → lowercase.)

**`marine_subjects`** (currently `FILMMAKING_MARINE_SUBJECTS`) — ✓ matches.

**`time_availability`** (`TIME_AVAILABILITY`)
```diff
- "1-2 weeks",
- "2-4 weeks",
- "1-3 months",
- "3-6 months",
- "6+ months",
- "Flexible",
+ "1 week to 10 days for a workshop, a project or individual training",
+ "2-3 entire weeks at a time for a workshop, a project or individual training",
+ "now and then for online classes",
```
⚠ verify: DB rows for filmmaking show `"aproject"` (no space) — may need `"2-3 entire weeks at a time for a workshop, aproject or individual training"` with the typo.

**`travel_willingness`** (`TRAVEL_WILLINGNESS`)
```diff
- "Yes, anywhere",
- "Yes, within my region",
- "Limited travel",
- "Prefer remote / online only",
+ "Yes, willing to travel internationally",
+ "Yes, but within my region only",
+ "No, prefer local training only",
+ "Depends on duration and location",
```

**`budget`** (`BUDGETS`)
```diff
- "Under $1,000",
- "$1,000 - $3,000",
- "$3,000 - $6,000",
- "$6,000 - $12,000",
- "$12,000+",
+ "Very limited budget. I basically have no financial means to be spent on this.",
+ "Small budget (under 1,000 €/USD)",
+ "Moderate budget (1,000 - 3,000 €/USD)",
+ "Advanced budget (3,000 - 6,000 €/USD)",
+ "Professional budget (6,000 - 12,000 €/USD)",
+ "All-In budget (>12,000 €/USD)",
```
Full replacement. Note: "All-In" is capitalized, "€/USD" not "$".

**`start_timeline`** (`START_TIMELINES`)
```diff
- "Immediately",
- "Within 1 month",
- "Within 3 months",
- "Within 6 months",
- "Within a year",
- "Not sure yet",
+ "Ready to start immediately",
+ "Within next 3 months",
+ "Within next 6 months",
+ "Flexible/Not sure yet",
```

**`referral_source`** (`REFERRAL_SOURCES`)
```diff
- "Social media",
- "Friend / family",
- "Google search",
- "BTM website",
- "Dive center / club",
- "Photography community",
- "Event / exhibition",
- "Other",
+ "Social Media (Instagram, Facebook, etc.)",
+ "Word of mouth",
+ "Online search",
+ "Diving community",
+ "Conservation organisation",
```
Add Other support (DB has dozens of free-text replies).
Note: the stored JSONB for filmmaking shows one row where the parser split `"Social Media (Instagram, Facebook, etc.)"` into three separate array elements — that's an ingestion bug worth flagging separately, but it doesn't affect the form-code change.

### Fields already matching — no changes
`first_name`, `last_name`, `nickname` (except optional), `email`, `phone`, `gender`, `nationality`, `country_of_residence`, `last_dive_date`, `buoyancy_skill`, all `skill_*` ratings, `ultimate_vision`, `inspiration_to_apply`, `questions_or_concerns`, `anything_else`, `filming_equipment` (short answer), `online_links`.

---

## PHOTOGRAPHY

**Form code file:** `src/lib/academy/forms/photography.ts`
**Google Form URL:** `https://docs.google.com/forms/d/e/1FAIpQLSeRbgBIGnIZ6IkWnDWW_8pGVX83Bew_YJLMRRlXWvBUPkSbhA/viewform`

### Field key renames
None.

### Field type changes
Same as filmmaking: `certification_level` → `multiselect`, `languages` → `multiselect`, `online_presence` → `multiselect`, `secondary_goal` → `select`.

### Enum option diffs

Photography shares almost every enum with filmmaking after alignment. The differences specific to photography:

**`equipment_owned`** (currently uses shared `EQUIPMENT_OWNED`; split into `PHOTOGRAPHY_EQUIPMENT`)
```diff
  "No equipment yet",
  "Action camera (GoPro, Osmo, Insta360, etc)",
  "Compact camera with housing",
  "DSLR/Mirrorless with housing",
- "Professional video camera",
+ "Professional photo/video camera",
  "Lighting equipment",
- "Drone",
- "Other"
```

**`content_created`** (currently `CONTENT_CREATED`, rename → `PHOTOGRAPHY_CONTENT_CREATED`)
```diff
- "Stills — underwater",
- "Stills — topside",
- "Video — underwater",
- "Video — topside",
- "Drone footage",
- "360 / VR",
- "Social media content",
+ "None yet, excited to start",
+ "Personal vacation photography",
+ "Social media content",
+ "Documentary style",
+ "Commercial work",
+ "Scientific/Research documentation",
```
Full replacement. Note: "Personal vacation **photography**" (not "videos" as in filmmaking).

**`income_from_photography`** (`INCOME_FROM_PHOTOGRAPHY`)
```diff
- "None",
- "Occasional / side income",
- "Part of my income",
- "Primary income source",
+ "No, thats not my goal.",
+ "No, not yet.",
+ "Occasionally (few projects per year)",
+ "Regular part-time income",
+ "Full-time income",
+ "Prefer not to say",
```
⚠ verify: `"No, thats not my goal."` — missing apostrophe in "thats" (extracted verbatim from the Google Form). Filmmaking's equivalent has it as `"No, that's not my goal."` with apostrophe. If the photography form has a typo, we preserve it.

**`primary_goal`** (`PRIMARY_GOALS`, rename → `PHOTOGRAPHY_GOALS`)
```diff
- "Learn underwater photography from scratch",
- "Improve existing skills",
- "Transition to professional",
- "Build a portfolio",
- "Content creation",
- "Conservation / scientific documentation",
+ "Learn basics of underwater photography as a hobby",
+ "Improve content creation for social media",
+ "Transform hobby into professional career",
+ "Enhance existing professional skills",
+ "Document marine conservation/research",
```

**`secondary_goal`** — text → select, same 5 options as `PHOTOGRAPHY_GOALS`.

**`learning_aspects`** (`LEARNING_ASPECTS`, rename → `PHOTOGRAPHY_LEARNING_ASPECTS`)
```diff
- "Camera settings & exposure",
- "Lighting techniques",
- "Composition",
- "Post-production / editing",
- "Wide-angle photography",
- "Macro photography",
- "Video / filmmaking",
- "Business & marketing",
- "Conservation storytelling",
+ "Basic equipment setup and operation",
+ "Camera settings and techniques",
+ "Lighting techniques",
+ "Marine life behavior understanding",
+ "Composition and content planning",
+ "Post-production and editing",
+ "Business aspects of underwater photography",
+ "Client relations and project management",
+ "Conservation documentation",
```
(Same structure as filmmaking's, just s/filming/photography/ in the "Business aspects" line and s/Storytelling/Composition/.)

**`content_to_create`** (`CONTENT_TO_CREATE`, rename → `PHOTOGRAPHY_CONTENT_TO_CREATE`)
```diff
- "Social media content",
- "Fine art prints",
- "Editorial / magazine",
- "Conservation / documentary",
- "Commercial / stock",
- "Personal portfolio",
- "Educational content",
+ "Personal/travel memories",
+ "Social media content",
+ "Documentary style photo series",
+ "Commercial/advertising content",
+ "Scientific/research documentation",
+ "Conservation stories",
```

**`marine_subjects`** (`MARINE_SUBJECTS`, rename → shared with filmmaking)
```diff
- "Coral reefs",
- "Large marine life (sharks, rays, whales)",
- "Macro / small creatures",
- "Wrecks",
- "Underwater landscapes / scenery",
- "Marine conservation",
- "Freediving / human subjects",
- "Cave / cenote environments",
+ "Coral reefs",
+ "Big marine life (sharks, whales, etc.)",
+ "Macro subjects",
+ "Marine behavior",
+ "Conservation stories",
```

**`learning_approach`** (`LEARNING_APPROACHES`)
```diff
- "One-on-one mentorship",
- "Group workshops",
- "Online courses",
- "Self-paced learning",
- "Field trips",
- "Portfolio reviews",
+ "Group workshops (within a group of approx. 10 persons)",
+ "Small group workshop (within a group of approx. 4 persons)",
+ "One-on-one mentorship",
+ "Mixed approach (combination of group and individual)",
+ "Project-based learning (within a BTM project)",
```
Same as filmmaking — collapse into shared `LEARNING_APPROACHES`.

**`online_presence`** — same as filmmaking (shared `ONLINE_PRESENCE`).

**`involvement_level`** — same as filmmaking (shared `INVOLVEMENT_LEVELS`), add Other support.

**`time_availability` / `travel_willingness` / `budget` / `start_timeline` / `referral_source`** — same changes as filmmaking. Use the shared constants.
⚠ verify: photography DB also has the `"aproject"` typo in time_availability.

**`physical_fitness`** — ✓ matches filmmaking's `FITNESS_LEVELS`.
⚠ verify: one DB row contains `"VERY ACTIVE AND REGULAR EXERCISE.REMISSION FROM CANCER."` — that's an "Other" input. Add Other support.

**`diving_*`, `certification_level`** — same as filmmaking's changes.

### Fields already matching — no changes
Same list as filmmaking plus `skill_composition` (photography-only rating), minus `skill_storytelling`.

---

## FREEDIVING

**Form code file:** `src/lib/academy/forms/freediving-modelling.ts`
**Google Form URL:** `https://docs.google.com/forms/d/e/1FAIpQLSf3CjCvUYGlHfzU8ifEqw7S_E0hw2et4T-tydbiG1EnLaypcA/viewform`

### Field key renames
None (DB keys match).

### Field type changes
- `certification_level`: `select` → `multiselect`
- `languages`: `text` → `multiselect`
- `online_presence`: `select` → `multiselect`
- `primary_goal`: `text` → `select` ← **code currently has it as a free text field — major functional bug**
- `secondary_goal`: `text` → `select` (new field in code — not currently in the freediving form at all)
- `learning_approach`: `select` → `multiselect`
- `land_movement_sports`: `text` → `select`
- `professional_material_purpose`: `text multiline` → `select`

### Enum option diffs

**`age`** — same changes as filmmaking (`"55+"` → `"54+"`, remove `"Under 18"`).

**`gender`** — ✓ matches.

**`languages`** — same `LANGUAGES` enum as other programs.

**`health_conditions`** (freediving-specific wording!)
```diff
+ "No health conditions affecting freediving",
+ "Yes, but cleared by doctor for freediving",
+ "Need medical clearance",
+ "Prefer to discuss privately",
```
Not the same text as filmmaking/photography/internship (those say "diving"). Needs a separate `HEALTH_CONDITIONS_FREEDIVING` constant. DB confirms: freediving rows have `"No health conditions affecting freediving"`.
Same applies to the question label (`"Do you have any specific health conditions that might affect freediving?"`).

**`physical_fitness`** — ✓ matches shared `FITNESS_LEVELS`.

**`certification_level`** (`FREEDIVING_CERTIFICATION_LEVELS`)
```diff
- "None",
+ "No certification yet",
+ "AIDA 1 or equivalent",
  "AIDA 2 or equivalent",
  "AIDA 3 or equivalent",
  "AIDA 4 or equivalent",
  "Freediving Instructor",
- "SSI level 2",
```
(Added "No certification yet" / "AIDA 1 or equivalent"; removed "SSI level 2" — legacy from older form version, still present in 1 DB row; will be handled by filter normalization.)
Type: change to `multiselect`.

**`number_of_sessions`** (`NUMBER_OF_SESSIONS`)
```diff
- "0-10",
- "11-50",
+ "0-50",
  "51-250",
  "250+",
```
(Same 3 buckets as `NUMBER_OF_DIVES` now. Could collapse into a shared `NUMBER_OF_DIVES` constant — but the *question label* is different, so keeping separate names for clarity is fine.)

**`practice_duration`** (`PRACTICE_DURATION`)
```diff
- "Less than 6 months",
- "6 months - 1 year",
- "1-2 years",
+ "Less than 1 year",
+ "> 1 year",
  "> 2 years",
+ "> 3 years",
+ "> 5 years",
+ "> 10 years",
```
(Full replacement; DB only has 4 of the 6 values because no one picked the other 2 yet.)

**`diving_environments`** (`FREEDIVING_ENVIRONMENTS`)
```diff
  "Tropical Reefs",
  "Open water",
  "Pool",
  "Deep pool",
+ "Cold water",
  "Deep diving",
  "Night diving",
```

**`performance_experience`** (`PERFORMANCE_EXPERIENCE`) — ✓ matches exactly.

**`land_movement_sports`** — currently a text field. Change to `select` with:
```
"None", "Yoga", "Dance", "Martial Arts", "Acrobatics", "Modeling"
```
DB has free-text values → add Other support ⚠ verify.

**`choreography_experience`** — ✓ matches.

**`filmed_underwater`** — ✓ matches.

**`btm_category`** (`FREEDIVING_BTM_CATEGORIES`)
```diff
- "Beginner",
- "Developing artist (starting to build a creative identity)",
- "Independent creator (experienced hobbyist/influencer seeking improvement)",
- "Professional (working in the field, seeking refinement or mentorship)",
+ "BEGINNER - Creative Explorer (Just starting, hobby-focused, seeking basic skills)",
+ "INDEPENDENT CREATOR (Experienced hobbyist/influencer seeking improvement)",
+ "ASPIRING PROFESSIONAL (Actor/model aiming to expand skill-set)",
```
Note: freediving has ONLY 3 options (not 5 like filmmaking/photography), and the "ASPIRING PROFESSIONAL" parenthetical is *different* from filmmaking/photography's ("Actor/model aiming to expand skill-set" vs "Part-time professional aiming for full-time career"). **This means `BTM_CATEGORIES` cannot be fully unified** — keep freediving's as a separate constant (`BTM_CATEGORIES_FREEDIVING`).

**`online_presence`** — same 5 options as filmmaking/photography → use shared `ONLINE_PRESENCE`. Type: `multiselect`.

**`primary_goal`** — currently text, change to `select`:
```
"Learn basics of expressive underwater movement as a hobby",
"Improve content creation for social media",
"Transform hobby into professional career",
"Enhance existing professional skills",
"Enjoy the community, network and socialise with likeminded people",
```
(Needs its own `FREEDIVING_GOALS` constant — freediving's list has a 5th option about community/socialising that the other programs don't.)

**`secondary_goal`** — new field. `select` with same `FREEDIVING_GOALS` options.

**`learning_aspects`** (`FREEDIVING_LEARNING_ASPECTS`)
```diff
  "Body awareness",
  "Soul-body connection",
  "Marine life behavior understanding",
  "Sensitive marine wildlife interactions",
  "Techniques for expressive underwater movement",
- "Creating individual movement sequences and choreography",
+ "Creating individual movements sequences and choreography",
  "Creative self-expression",
  "Business aspects of underwater performance",
+ "Client relations and project management",
```
(Added "Client relations and project management"; "movement" → "movements" per Google Form. ⚠ verify: likely a typo in partner A's form — confirm before propagating.)

**`learning_approach`** (`FREEDIVING_LEARNING_APPROACHES`)
```diff
- "One-on-one mentorship",
- "Group workshops",
- "Small group workshop",
- "Mixed approach (combination of group and individual)",
- "Project-based learning",
- "Self-paced with guidance",
+ "Group workshops (within a group of approx. 10 persons)",
+ "Small group workshop (within a group of approx. 4 persons)",
+ "One-on-one mentorship",
+ "Mixed approach (combination of group and individual)",
+ "Project-based learning (within a BTM project)",
```
Same as filmmaking/photography's. Collapse into shared `LEARNING_APPROACHES`. Type: `multiselect`.

**`professional_material_purpose`** — new field. `select`:
```
"No, that's not my goal",
"Yes, for personal/travel memories",
"Yes, for commercial purposes",
```

**`time_availability` / `travel_willingness` / `budget` / `start_timeline` / `referral_source`** — same shared enums as filmmaking/photography.

### Missing in code vs Google Form
- `secondary_goal` — exists in Google Form section 5, absent from form code.

### Fields already matching
`first_name`, `last_name`, `nickname`, `email`, `phone`, `nationality`, `country_of_residence`, `current_occupation`, `last_session_date`, `comfortable_max_depth`, `breath_hold_time`, `personal_best`, `freediving_equipment`, comfort_*_rating fields, `ultimate_vision`, `inspiration_to_apply`, `questions_or_concerns`, `anything_else`, `online_links`.

---

## INTERNSHIP

**Form code file:** `src/lib/academy/forms/internship.ts`
**Google Form URL:** `https://docs.google.com/forms/d/e/1FAIpQLSdESHp9FnmsAhjKeeVB7dwTtzOPzxd0Tm0yVsAQlN3Wcxk5mw/viewform`

### Field key renames (code → DB)
| Form code `name` | DB key | Why |
|---|---|---|
| `hoped_gains` | `internship_hopes` | Code has never matched DB for this field |
| `azores_ties` | `accommodation_ties` | Same |
| `why_good_candidate` | `candidacy_reason` | Same |

### Field type changes
- `age` — change from `select` (AGE_RANGES) to `text` (short answer). Internship is the only form that takes a raw age number. Override at the internship level, do not change the shared `personalFields`.
- `certification_level`: `select` → `multiselect`
- `languages`: `text` → `multiselect`
- `nickname`: `required: true` → `required: false` (matches Google Form optional marker).

### Fields to add
The Google Form has **no** BTM Academy investment/commitment section (no `btm_category`, `budget`, `time_availability`, `travel_willingness`, `start_timeline`, `primary_goal`, `secondary_goal`, `involvement_level`, `learning_aspects`, `learning_approach`, `content_to_create`, `marine_subjects`, `income_from_filming`, `online_presence`, `planning_to_invest`, `equipment_owned`, `years_experience`, `skill_*` ratings). All of these should be absent from the internship form code as well. **Confirm the current code doesn't accidentally collect them.** (Looking at `internship.ts`, it correctly doesn't — good.)

### Enum option diffs

**`age`** — text field, no enum.

**`gender`** — ✓ matches `GENDERS`.

**`languages`** — same as other programs, `LANGUAGES` multiselect with Other. ⚠ verify extractor caught `[Other]` here.

**`education_level`** (`EDUCATION_LEVELS` — currently local to `internship.ts`)
```diff
- "High school",
- "Vocational training",
+ "Secondary school diploma",
+ "High school diploma",
+ "Vocational training / apprenticeship",
  "Bachelor's degree",
  "Master's degree",
- "PhD",
+ "Doctorate / PhD",
- "Other",
```
Remove the literal `"Other"` — add Other support at field level.

**`field_of_study`** — ✓ text (matches short answer).

**`recent_activities`** — ✓ paragraph (matches).

**`online_links`** — ✓ text (optional).

**`accommodation_ties`** (after rename) — ✓ paragraph (optional).

**`current_occupation`** — ✓ short answer, **required**. Form code currently has it required through `backgroundFields` — ✓ ok. But filmmaking/photography/freediving forms leave it optional. This means the `backgroundFields` shared definition is currently over-constrained for those programs, OR under-constrained for internship. **Pick one:** either pass `required` as a param, or duplicate the field per program.

**`filmmaking_experience`** — ✓ paragraph, required.

**`filming_equipment`** — ⚠ Google Form says **optional**. Code says `required: true`. Change to optional.

**`content_created`** (currently local `CONTENT_CREATED` inside `internship.ts`, rename → `INTERNSHIP_CONTENT_CREATED`)
```diff
- "Underwater photography",
- "Underwater videography",
- "Topside photography",
- "Topside videography",
- "Drone footage",
- "Social media content",
- "Documentary",
- "Commercial",
+ "None yet, excited to start",
+ "Personal vacation videos",
+ "Social media content",
+ "Documentary style",
+ "Commercial work",
+ "Scientific/Research documentation",
+ "Overwater photography",
+ "Underwater photography",
```
Full replacement. Add Other support. ⚠ note: internship's list is larger than filmmaking's (adds "Overwater photography" and "Underwater photography"), so keep it as its own constant.

**`inspiration_to_apply`** — ✓ paragraph.

**`ultimate_vision`** — ✓ paragraph.

**`internship_hopes`** (after rename) — ✓ paragraph.

**`candidacy_reason`** (after rename) — ✓ paragraph.

**`physical_fitness`** — ✓ matches shared `FITNESS_LEVELS`. ⚠ verify Other support (internship extraction shows `[Other]`).

**`health_conditions`** — ✓ matches shared `HEALTH_CONDITIONS` ("affecting diving" wording).

**`diving_types`** — ✓ matches shared `DIVING_TYPES`. Add Other support ⚠ verify.

**`certification_level`** — same options as filmmaking/photography (shared `CERTIFICATION_LEVELS_SCUBA`) **except the freediver sub-label differs**:
- filmmaking/photography: `"Certified Freediver, please specify level below:"` (with "please" and colon)
- internship: `"Certified Freediver, specify level below"` (no "please", no colon)

Two options: (a) keep a separate `CERTIFICATION_LEVELS_SCUBA_INTERNSHIP` constant, or (b) flag this to partner A as a minor consistency issue to fix on the Google Form side, then unify. **Recommendation:** (b), but do not block on it. Ship with a separate constant first, collapse later.

**`number_of_dives`** — ✓ matches.

**`last_dive_date`** — ✓ date.

**`diving_environments`** (`INTERNSHIP_DIVING_ENVIRONMENTS`)
```diff
  "Tropical Reefs",
+ "Open water",
  "Cold water",
  "Deep diving",
  "Night diving",
- "Cave / Wreck diving",
+ "Cave/Wreck diving",
```
Internship has "Open water" which filmmaking/photography don't. Keep as separate constant.

**`buoyancy_skill`** — ✓ rating 1-10.

**`referral_source`** — same 5 options as filmmaking/photography (shared `REFERRAL_SOURCES`), add Other support. ⚠ verify.

**`questions_or_concerns` / `anything_else`** — ✓ paragraphs.

### Fields already matching
`first_name`, `last_name`, `email`, `phone`, `nationality`, `country_of_residence`, `field_of_study`, `recent_activities`, `online_links`, `filmmaking_experience`, `inspiration_to_apply`, `ultimate_vision`, `questions_or_concerns`, `anything_else`.

---

## Summary of open questions

Please answer or confirm the following before I turn this into an implementation plan:

1. **⚠ verify list** above — mostly about "Other" options and small typos. If you can open each Google Form and check one section at a time, that resolves most of them. If not, I can make best-effort guesses using DB evidence and flag any remaining ambiguities.
2. **`CERTIFICATION_LEVELS_SCUBA_INTERNSHIP`** — do we keep a separate constant because of the "please"/colon difference, or do you want to normalize internship's form in Google Forms first and use a single constant?
3. **`current_occupation` required-ness** — split the shared `backgroundFields` so internship can be required while filmmaking/photography/freediving can be optional? Or flag it in a program override array?
4. **Typo preservation** — in cases where the Google Form has a typo that's also in the DB (`"aproject"`, `"thats"`, `"movements sequences"`, `"Conservation organisation"` — British spelling, probably not a typo), should we preserve it exactly in form code (so new website submissions match the legacy data) or fix it and rely on filter normalization to map the two?
5. **`BTM_CATEGORIES` unification** — happy to keep `BTM_CATEGORIES_MEDIA` (5 options for filmmaking/photography) separate from `BTM_CATEGORIES_FREEDIVING` (3 options, different "ASPIRING PROFESSIONAL" parenthetical)?
6. **`"Other"` field-definition support** — the current `types.ts` doesn't have an `allowOther` flag on `SelectFieldDef` / `MultiSelectFieldDef`. Do we add one as part of Phase A (so the schema builder and renderer both know about it), or defer to Phase B?

Once you answer those (or say "your best judgement, go"), I'll write the implementation plan for Phase A: apply all the code changes, consolidate enums into `common/options.ts`, delete the `dataOptions` workaround in `contacts-panel.tsx`, update the field registry, and update the tests.

Phase B (filter normalization for age numeric-to-range, certification mapping, and legacy-value bucketing) is a separate plan after Phase A ships.
