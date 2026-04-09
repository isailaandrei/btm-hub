# Contacts Table Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add column visibility, per-column filtering, and bulk tag assignment to the admin contacts table.

**Architecture:** All three features are client-side. Data is already loaded via AdminDataProvider. Column visibility persists to a new `preferences` JSONB column on profiles. Filtering and selection are ephemeral component state. One new server action for bulk tag assignment.

**Tech Stack:** Next.js 16, React 19, Supabase, shadcn/ui (Popover, Checkbox), Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-04-09-contacts-table-features-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/<timestamp>_add_preferences.sql` | Create | Add `preferences` JSONB column to profiles |
| `src/types/database.ts` | Modify | Add `preferences` to Profile interface |
| `src/components/ui/popover.tsx` | Create | shadcn Popover component (via CLI) |
| `src/components/ui/checkbox.tsx` | Create | shadcn Checkbox component (via CLI) |
| `src/app/(dashboard)/admin/contacts/field-registry.ts` | Create | Static registry of all filterable application fields |
| `src/lib/data/profiles.ts` | Modify | Add `updateProfilePreferences` fetcher |
| `src/app/(dashboard)/admin/contacts/actions.ts` | Modify | Add `updatePreferences` and `bulkAssignTag` actions |
| `src/app/(dashboard)/admin/admin-data-provider.tsx` | Modify | Add preferences state + fetch |
| `src/app/(dashboard)/admin/contacts/column-picker.tsx` | Create | Column visibility popover with search |
| `src/app/(dashboard)/admin/contacts/column-filter-popover.tsx` | Create | Per-column multi-select filter popover |
| `src/app/(dashboard)/admin/contacts/bulk-action-bar.tsx` | Create | Sticky bar with tag picker for bulk assignment |
| `src/app/(dashboard)/admin/contacts/contacts-filters.tsx` | Modify | Add ColumnPicker button |
| `src/app/(dashboard)/admin/contacts/contacts-panel.tsx` | Modify | Dynamic columns, filtering, selection, bulk actions |
| `src/app/(dashboard)/admin/contacts/actions.test.ts` | Create | Tests for new server actions |

---

## Task 1: Foundation — Migration, Types, shadcn Components

**Files:**
- Create: `supabase/migrations/<timestamp>_add_preferences.sql`
- Modify: `src/types/database.ts:1-9`
- Modify: `src/lib/data/profiles.ts:6-18` (select columns)
- Create: `src/components/ui/popover.tsx` (via shadcn CLI)
- Create: `src/components/ui/checkbox.tsx` (via shadcn CLI)

- [ ] **Step 1: Create the migration**

Create file `supabase/migrations/<use_current_timestamp>_add_preferences.sql`:

```sql
ALTER TABLE profiles ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}';

-- Atomic merge function to avoid read-modify-write race conditions.
-- Deep-merges a JSONB patch into existing preferences in a single UPDATE.
CREATE OR REPLACE FUNCTION merge_preferences(p_profile_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  UPDATE profiles
  SET preferences = preferences || p_patch
  WHERE id = p_profile_id
  RETURNING preferences;
$$;
```

- [ ] **Step 2: Update the Profile type**

In `src/types/database.ts`, add `preferences` to the Profile interface:

```ts
export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  role: "admin" | "member";
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Update profile fetchers to include preferences**

In `src/lib/data/profiles.ts`, add `preferences` to only the `getProfile` select (current user). Do NOT add it to `getAllProfiles` or `getProfileById` — preferences is only needed for the current admin, not when listing all profiles.

`getProfile` (line 11):
```ts
.select("id, email, role, display_name, bio, avatar_url, preferences, created_at, updated_at")
```

`getAllProfiles` and `getProfileById` keep their existing select strings unchanged — the `Profile` type has `preferences` but these fetchers return a subset. This matches the existing pattern where `getAllProfiles` already omits `bio` from its select in practice.

- [ ] **Step 4: Install shadcn Popover and Checkbox**

```bash
npx shadcn@latest add popover checkbox
```

Verify both files exist:
```bash
ls src/components/ui/popover.tsx src/components/ui/checkbox.tsx
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/ src/types/database.ts src/lib/data/profiles.ts src/components/ui/popover.tsx src/components/ui/checkbox.tsx
git commit -m "feat: add preferences column and shadcn popover/checkbox components"
```

---

## Task 2: Field Registry

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/field-registry.ts`

The registry is a static array of all `select`, `multiselect`, and `rating` fields from all form definitions. Fields where programs have different options use the union of all options. The 8 curated fields are marked with `curated: true`.

- [ ] **Step 1: Create the field registry**

Create `src/app/(dashboard)/admin/contacts/field-registry.ts`:

```ts
import type { ProgramSlug } from "@/types/database";

export interface FieldRegistryEntry {
  key: string;
  label: string;
  type: "select" | "multiselect" | "rating";
  options: string[];
  programs: ProgramSlug[];
  curated: boolean;
}

const RATING_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

export const FIELD_REGISTRY: FieldRegistryEntry[] = [
  // ---- Curated (shown upfront in column picker) ----
  {
    key: "budget",
    label: "Budget",
    type: "select",
    options: ["Under $1,000", "$1,000 - $3,000", "$3,000 - $5,000", "$5,000 - $10,000", "$10,000+"],
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "time_availability",
    label: "Time Availability",
    type: "select",
    options: ["1-2 weeks", "2-4 weeks", "1-3 months", "3-6 months", "6+ months", "Flexible"],
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "start_timeline",
    label: "Start Timeline",
    type: "select",
    options: ["Immediately", "Within 1 month", "Within 3 months", "Within 6 months", "Within a year", "Not sure yet"],
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "btm_category",
    label: "BTM Category",
    type: "select",
    options: [
      // Common (filmmaking/photography)
      "BEGINNER - Creative Explorer (Just starting, hobby-focused, seeking basic skills)",
      "INDEPENDENT CREATOR (Experienced hobbyist/influencer seeking improvement)",
      "ASPIRING PROFESSIONAL (Part-time professional aiming for full-time career)",
      "DEDICATED ACHIEVER (Business-focused, seeking intensive mentorship)",
      "OCEAN STEWARD (NGO/scientific focus, conservation-driven)",
      // Freediving-specific
      "Beginner",
      "Developing artist (starting to build a creative identity)",
      "Independent creator (experienced hobbyist/influencer seeking improvement)",
      "Professional (working in the field, seeking refinement or mentorship)",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "certification_level",
    label: "Certification Level",
    type: "select",
    options: [
      // Common (filmmaking/photography) — scuba
      "None", "Open Water (OW)", "Advanced Open Water (AOW)", "Rescue Diver", "Divemaster", "Instructor",
      // Freediving-specific
      "AIDA 2 or equivalent", "AIDA 3 or equivalent", "AIDA 4 or equivalent", "Freediving Instructor", "SSI level 2",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "years_experience",
    label: "Years of Experience",
    type: "select",
    options: ["None", "Less than 1 year", "1-2 years", "3-5 years", "5+"],
    programs: ["filmmaking", "photography"],
    curated: true,
  },
  {
    key: "involvement_level",
    label: "Involvement Level",
    type: "select",
    options: ["Complete beginner", "Hobby", "Part-time", "Full-time", "Conservation/Scientific work"],
    programs: ["filmmaking", "photography"],
    curated: true,
  },
  {
    key: "travel_willingness",
    label: "Travel Willingness",
    type: "select",
    options: ["Yes, anywhere", "Yes, within my region", "Limited travel", "Prefer remote / online only"],
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },

  // ---- Personal & Health (all programs) ----
  {
    key: "age",
    label: "Age Range",
    type: "select",
    options: ["Under 18", "18-24", "25-34", "35-44", "45-54", "55+"],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "gender",
    label: "Gender",
    type: "select",
    options: ["Male", "Female", "Non-binary", "Prefer not to say"],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "physical_fitness",
    label: "Physical Fitness",
    type: "select",
    options: [
      "Excellent - Regular exercise, no health concerns",
      "Good - Moderately active, no major health concerns",
      "Average - Some physical activity, manageable health conditions",
      "Need improvement - Limited physical activity or health concerns",
      "Prefer to discuss privately",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "health_conditions",
    label: "Health Conditions",
    type: "select",
    options: [
      "No health conditions affecting diving",
      "Yes, but cleared by doctor for diving",
      "Need medical clearance",
      "Prefer to discuss privately",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },

  // ---- Diving (filmmaking + photography) ----
  {
    key: "diving_types",
    label: "Types of Diving",
    type: "multiselect",
    options: [
      "Recreational Scuba diving", "Technical Scuba diving", "Snorkeling",
      "Technical diving", "Rebreather diving", "Neither, but interested in learning", "Freediving",
    ],
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "number_of_dives",
    label: "Number of Dives",
    type: "select",
    options: ["0-50", "51-250", "250+"],
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "diving_environments",
    label: "Diving Environments",
    type: "multiselect",
    options: [
      // Common (filmmaking/photography)
      "Tropical Reefs", "Cold water", "Deep diving", "Night diving", "Cave / Wreck diving", "Other",
      // Freediving-specific
      "Open water", "Pool", "Deep pool",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },

  // ---- Equipment ----
  {
    key: "planning_to_invest",
    label: "Planning to Invest",
    type: "select",
    options: ["Yes, within the near future", "Yes, within the next years", "No immediate plans"],
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "equipment_owned",
    label: "Equipment Owned",
    type: "multiselect",
    options: [
      // Filmmaking-specific
      "Camera", "Underwater housing", "Video lights", "Wide-angle lens",
      "Macro lens", "Drone", "Gimbal / stabilizer", "Editing software",
      // Common (photography)
      "No equipment yet", "Action camera (GoPro, Osmo, Insta360, etc)",
      "Compact camera with housing", "DSLR/Mirrorless with housing",
      "Professional video camera", "Lighting equipment", "Other",
    ],
    programs: ["filmmaking", "photography"],
    curated: false,
  },

  // ---- Creative Profile ----
  {
    key: "content_created",
    label: "Content Created",
    type: "multiselect",
    options: [
      // Filmmaking-specific
      "None yet, excited to start", "Personal vacation videos", "Social media content",
      "Documentary style", "Commercial work", "Scientific / research documentation",
      "Conservation stories", "Other",
      // Common (photography)
      "Stills — underwater", "Stills — topside", "Video — underwater",
      "Video — topside", "Drone footage", "360 / VR",
    ],
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "online_presence",
    label: "Online Presence",
    type: "select",
    options: [
      // Filmmaking
      "None", "Personal social media only", "Dedicated filming social media",
      "Website / portfolio", "Multiple platforms",
      // Common (photography)
      "Active social media", "Personal website", "Professional portofolio",
      "Client base", "None of the above",
      // Freediving
      "Professional portfolio",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "income_from_filming",
    label: "Income from Filming",
    type: "select",
    options: ["None", "Occasional / side income", "Part of my income", "Primary income source"],
    programs: ["filmmaking"],
    curated: false,
  },
  {
    key: "income_from_photography",
    label: "Income from Photography",
    type: "select",
    options: ["None", "Occasional / side income", "Part of my income", "Primary income source"],
    programs: ["photography"],
    curated: false,
  },

  // ---- Goals ----
  {
    key: "primary_goal",
    label: "Primary Goal",
    type: "select",
    options: [
      // Filmmaking
      "Learn basics of underwater filming as a hobby",
      "Improve content creation for social media",
      "Transform hobby into professional career",
      "Enhance existing professional skills",
      "Document marine conservation/research",
      // Common (photography)
      "Learn underwater photography from scratch", "Improve existing skills",
      "Transition to professional", "Build a portfolio",
      "Content creation", "Conservation / scientific documentation",
    ],
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "learning_aspects",
    label: "Learning Aspects",
    type: "multiselect",
    options: [
      // Filmmaking
      "Basic equipment setup & operation", "Camera settings & techniques",
      "Lighting techniques", "Marine life behavior understanding",
      "Storytelling & content planning", "Post-production & editing",
      "Business aspects of underwater filming", "Client relations & project management",
      "Conservation documentation",
      // Common (photography)
      "Camera settings & exposure", "Composition",
      "Post-production / editing", "Wide-angle photography", "Macro photography",
      "Video / filmmaking", "Business & marketing", "Conservation storytelling",
      // Freediving
      "Body awareness", "Soul-body connection",
      "Sensitive marine wildlife interactions",
      "Techniques for expressive underwater movement",
      "Creating individual movement sequences and choreography",
      "Creative self-expression", "Business aspects of underwater performance",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "content_to_create",
    label: "Content to Create",
    type: "multiselect",
    options: [
      // Filmmaking
      "Personal / travel memories", "Documentary style films",
      "Commercial / advertising content", "Scientific / research documentation",
      "Conservation stories",
      // Common (photography) — some overlap with filmmaking
      "Social media content", "Fine art prints", "Editorial / magazine",
      "Conservation / documentary", "Commercial / stock",
      "Personal portfolio", "Educational content",
    ],
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "learning_approach",
    label: "Learning Approach",
    type: "multiselect",
    options: [
      // Filmmaking
      "One-on-one mentorship", "Group workshops", "Small group workshop",
      "Mixed approach (combination of group and individual)", "Project-based learning",
      // Common (photography)
      "Online courses", "Self-paced learning", "Field trips", "Portfolio reviews",
      // Freediving
      "Self-paced with guidance",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "marine_subjects",
    label: "Marine Subjects",
    type: "multiselect",
    options: [
      // Filmmaking
      "Coral reefs", "Big marine life (sharks, whales, etc.)", "Macro subjects",
      "Marine behavior", "Conservation stories",
      // Common (photography)
      "Large marine life (sharks, rays, whales)", "Macro / small creatures",
      "Wrecks", "Underwater landscapes / scenery", "Marine conservation",
      "Freediving / human subjects", "Cave / cenote environments",
    ],
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "referral_source",
    label: "Referral Source",
    type: "multiselect",
    options: [
      "Social media", "Friend / family", "Google search", "BTM website",
      "Dive center / club", "Photography community", "Event / exhibition", "Other",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },

  // ---- Freediving-specific selects ----
  {
    key: "number_of_sessions",
    label: "Freediving Sessions",
    type: "select",
    options: ["0-10", "11-50", "51-250", "250+"],
    programs: ["freediving"],
    curated: false,
  },
  {
    key: "practice_duration",
    label: "Practice Duration",
    type: "select",
    options: ["Less than 6 months", "6 months - 1 year", "1-2 years", "> 2 years"],
    programs: ["freediving"],
    curated: false,
  },
  {
    key: "performance_experience",
    label: "Performance Experience",
    type: "select",
    options: ["None", "Less than 1 year", "1-3 years", "3-5 years", "5+ years"],
    programs: ["freediving"],
    curated: false,
  },
  {
    key: "choreography_experience",
    label: "Choreography Experience",
    type: "select",
    options: ["No", "Yes, little experience", "Yes, extended experience"],
    programs: ["freediving"],
    curated: false,
  },
  {
    key: "filmed_underwater",
    label: "Filmed Underwater",
    type: "select",
    options: ["No", "Yes, little experience", "Yes, extended experience"],
    programs: ["freediving"],
    curated: false,
  },

  // ---- Ratings: Filmmaking + Photography shared ----
  {
    key: "buoyancy_skill",
    label: "Buoyancy Skill",
    type: "rating",
    options: RATING_OPTIONS,
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "skill_camera_settings",
    label: "Camera Settings",
    type: "rating",
    options: RATING_OPTIONS,
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "skill_lighting",
    label: "Lighting",
    type: "rating",
    options: RATING_OPTIONS,
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "skill_post_production",
    label: "Post-Production",
    type: "rating",
    options: RATING_OPTIONS,
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "skill_color_correction",
    label: "Color Correction",
    type: "rating",
    options: RATING_OPTIONS,
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "skill_drone",
    label: "Drone",
    type: "rating",
    options: RATING_OPTIONS,
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "skill_over_water",
    label: "Over-Water",
    type: "rating",
    options: RATING_OPTIONS,
    programs: ["filmmaking", "photography"],
    curated: false,
  },

  // ---- Ratings: Filmmaking only ----
  {
    key: "skill_storytelling",
    label: "Storytelling",
    type: "rating",
    options: RATING_OPTIONS,
    programs: ["filmmaking"],
    curated: false,
  },

  // ---- Ratings: Photography only ----
  {
    key: "skill_composition",
    label: "Composition",
    type: "rating",
    options: RATING_OPTIONS,
    programs: ["photography"],
    curated: false,
  },

  // ---- Ratings: Freediving only ----
  {
    key: "comfort_without_dive_line",
    label: "Comfort Without Dive Line",
    type: "rating",
    options: RATING_OPTIONS,
    programs: ["freediving"],
    curated: false,
  },
  {
    key: "comfort_without_fins",
    label: "Comfort Without Fins",
    type: "rating",
    options: RATING_OPTIONS,
    programs: ["freediving"],
    curated: false,
  },
  {
    key: "comfort_without_mask",
    label: "Comfort Without Mask",
    type: "rating",
    options: RATING_OPTIONS,
    programs: ["freediving"],
    curated: false,
  },
];

/** Curated fields shown upfront in the column picker. */
export const CURATED_FIELDS = FIELD_REGISTRY.filter((f) => f.curated);

/** Lookup a registry entry by key. */
export function getFieldEntry(key: string): FieldRegistryEntry | undefined {
  return FIELD_REGISTRY.find((f) => f.key === key);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/admin/contacts/field-registry.ts
git commit -m "feat: add application field registry for contacts table columns"
```

---

## Task 3: Preferences Data Layer

**Files:**
- Modify: `src/lib/data/profiles.ts` — add `updateProfilePreferences`
- Modify: `src/app/(dashboard)/admin/contacts/actions.ts` — add `updatePreferences`
- Modify: `src/app/(dashboard)/admin/admin-data-provider.tsx` — add preferences state
- Test: `src/app/(dashboard)/admin/contacts/actions.test.ts`

- [ ] **Step 1: Add updateProfilePreferences to data layer**

Append to `src/lib/data/profiles.ts`:

```ts
export async function updateProfilePreferences(
  profileId: string,
  patch: Record<string, unknown>,
) {
  await requireAdmin();
  const supabase = await createClient();

  // Atomic merge via Postgres RPC — avoids read-modify-write race condition
  const { data, error } = await supabase.rpc("merge_preferences", {
    p_profile_id: profileId,
    p_patch: patch,
  });

  if (error) throw new Error(`Failed to update preferences: ${error.message}`);
  return data as Record<string, unknown>;
}
```

Also add the import for `requireAdmin` at the top of the file (it's not currently imported):
```ts
import { requireAdmin } from "@/lib/auth/require-admin";
```

- [ ] **Step 2: Add updatePreferences server action**

In `src/app/(dashboard)/admin/contacts/actions.ts`, add at the top imports:

```ts
import { updateProfilePreferences } from "@/lib/data/profiles";
```

Add the action:

```ts
export async function updatePreferences(patch: Record<string, unknown>) {
  const profile = await requireAdmin();
  return updateProfilePreferences(profile.id, patch);
}
```

- [ ] **Step 3: Add preferences to AdminDataProvider**

In `src/app/(dashboard)/admin/admin-data-provider.tsx`:

Add to state (after the existing state declarations around line 68):
```ts
const [preferences, setPreferences] = useState<Record<string, unknown>>({});
const preferencesFetchState = useRef<FetchState>("idle");
```

Add to context interface (around line 36):
```ts
preferences: Record<string, unknown>;
setPreferences: (prefs: Record<string, unknown>) => void;
ensurePreferences: () => void;
```

Add the `ensurePreferences` function (after `ensureContacts`). This fetches only the current user's preferences — a lightweight single-row query, separate from `ensureProfiles` which fetches all users:
```ts
const ensurePreferences = useCallback(() => {
  if (preferencesFetchState.current !== "idle") return;
  preferencesFetchState.current = "loading";

  const supabase = getSupabase();

  async function fetchPreferences() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      preferencesFetchState.current = "done";
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", user.id)
      .single();

    if (error) {
      preferencesFetchState.current = "idle";
      toast.error("Failed to load preferences.");
      return;
    }

    setPreferences((data?.preferences as Record<string, unknown>) ?? {});
    preferencesFetchState.current = "done";
  }

  fetchPreferences();
}, []);
```

Add `preferences`, `setPreferences`, and `ensurePreferences` to the context Provider value.

- [ ] **Step 4: Write test for updatePreferences action**

Create `src/app/(dashboard)/admin/contacts/actions.test.ts`:

```ts
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

const mockUpdateContact = vi.fn();
const mockAssignTag = vi.fn();
const mockUnassignTag = vi.fn();
const mockAddContactNote = vi.fn();
const mockBulkAssignTags = vi.fn();

vi.mock("@/lib/data/contacts", () => ({
  updateContact: mockUpdateContact,
  assignTag: mockAssignTag,
  unassignTag: mockUnassignTag,
  addContactNote: mockAddContactNote,
  bulkAssignTags: mockBulkAssignTags,
}));

const mockUpdateProfilePreferences = vi.fn();

vi.mock("@/lib/data/profiles", () => ({
  updateProfilePreferences: mockUpdateProfilePreferences,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Import only what exists at this point — bulkAssignTag is added in Task 6
const { updatePreferences } = await import("./actions");

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("updatePreferences", () => {
  beforeEach(() => {
    mockUpdateProfilePreferences.mockResolvedValue({});
  });

  it("calls updateProfilePreferences with admin id and patch", async () => {
    const patch = { contacts_table: { visible_columns: ["budget"] } };
    await updatePreferences(patch);
    expect(mockUpdateProfilePreferences).toHaveBeenCalledWith(mockProfile.id, patch);
  });
});
```

- [ ] **Step 5: Run tests**

```bash
npm run test:unit -- --run src/app/\(dashboard\)/admin/contacts/actions.test.ts
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/profiles.ts src/app/\(dashboard\)/admin/contacts/actions.ts src/app/\(dashboard\)/admin/admin-data-provider.tsx src/app/\(dashboard\)/admin/contacts/actions.test.ts
git commit -m "feat: add preferences data layer and admin data provider integration"
```

---

## Task 4: Column Visibility

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/column-picker.tsx`
- Modify: `src/app/(dashboard)/admin/contacts/contacts-filters.tsx`
- Modify: `src/app/(dashboard)/admin/contacts/contacts-panel.tsx`

- [ ] **Step 1: Create the ColumnPicker component**

Create `src/app/(dashboard)/admin/contacts/column-picker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { FIELD_REGISTRY, CURATED_FIELDS } from "./field-registry";
import { PROGRAM_BADGE_CLASS } from "../constants";

interface ColumnPickerProps {
  visibleColumns: string[];
  onToggle: (key: string) => void;
}

export function ColumnPicker({ visibleColumns, onToggle }: ColumnPickerProps) {
  const [search, setSearch] = useState("");

  const q = search.toLowerCase().trim();
  const showSearch = q.length > 0;

  const displayed = showSearch
    ? FIELD_REGISTRY.filter((f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q))
    : CURATED_FIELDS;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Columns
          {visibleColumns.length > 0 && (
            <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {visibleColumns.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="border-b border-border p-3">
          <input
            type="text"
            placeholder="Search fields..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {!showSearch && (
            <p className="mb-1 px-2 text-xs font-semibold text-muted-foreground">Suggested</p>
          )}
          {displayed.length === 0 && (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">No matching fields</p>
          )}
          {displayed.map((field) => {
            const checked = visibleColumns.includes(field.key);
            return (
              <label
                key={field.key}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggle(field.key)}
                />
                <span className="flex-1 text-sm text-foreground">{field.label}</span>
                <span className="flex gap-0.5">
                  {field.programs.map((p) => (
                    <Badge
                      key={p}
                      variant="outline"
                      className={`px-1 py-0 text-[10px] capitalize ${PROGRAM_BADGE_CLASS[p] ?? ""}`}
                    >
                      {p.slice(0, 4)}
                    </Badge>
                  ))}
                </span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Add ColumnPicker to ContactsFilters**

In `src/app/(dashboard)/admin/contacts/contacts-filters.tsx`, add to the props interface:

```ts
visibleColumns: string[];
onColumnToggle: (key: string) => void;
```

Add import:
```ts
import { ColumnPicker } from "./column-picker";
```

Add the ColumnPicker button after the program Select (around line 83, after the `</Select>` closing tag):

```tsx
<ColumnPicker visibleColumns={visibleColumns} onToggle={onColumnToggle} />
```

- [ ] **Step 3: Wire column visibility state into ContactsPanel**

In `src/app/(dashboard)/admin/contacts/contacts-panel.tsx`:

Add imports:
```ts
import { useAdminData } from "../admin-data-provider";
import { getFieldEntry, type FieldRegistryEntry } from "./field-registry";
import { updatePreferences } from "./actions";
```

Add state and preferences loading (after existing state declarations):

```ts
const { preferences, ensurePreferences } = useAdminData();

const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
const initializedRef = useRef(false);

// Load saved column preferences on mount
useEffect(() => {
  ensurePreferences();
}, [ensurePreferences]);

// Sync preferences to local state once loaded (one-time initialization)
useEffect(() => {
  if (initializedRef.current) return;
  const saved = (preferences as { contacts_table?: { visible_columns?: string[] } })
    ?.contacts_table?.visible_columns;
  if (Array.isArray(saved)) {
    setVisibleColumns(saved);
    initializedRef.current = true;
  }
}, [preferences]);
```

Add the toggle handler with debounced save. The timeout is set outside the state updater to avoid side effects in a pure function:

```ts
const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

function handleColumnToggle(key: string) {
  setVisibleColumns((prev) => {
    return prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
  });

  // Debounced save — runs after the state update
  clearTimeout(saveTimeoutRef.current);
  saveTimeoutRef.current = setTimeout(() => {
    setVisibleColumns((current) => {
      updatePreferences({ contacts_table: { visible_columns: current } });
      return current; // no state change, just reading current value
    });
  }, 1000);
}
```

Note: reading `visibleColumns` inside the timeout via a state updater that returns the same value avoids stale closures. Alternatively, use a ref to track the latest value.

Pass to ContactsFilters:
```tsx
<ContactsFilters
  /* ...existing props... */
  visibleColumns={visibleColumns}
  onColumnToggle={handleColumnToggle}
/>
```

- [ ] **Step 3b: Extract PROGRAM_BADGE_CLASS to shared constants**

Move the `PROGRAM_BADGE_CLASS` constant from `contacts-panel.tsx` (lines 22-27) to `src/app/(dashboard)/admin/constants.ts` (which already has `TAG_COLOR_CLASSES`). Import it in `contacts-panel.tsx` and `column-picker.tsx` from there.

```ts
// In src/app/(dashboard)/admin/constants.ts — append:
export const PROGRAM_BADGE_CLASS: Record<string, string> = {
  filmmaking: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  photography: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  freediving: "border-teal-500/40 bg-teal-500/10 text-teal-400",
  internship: "border-purple-500/40 bg-purple-500/10 text-purple-400",
};
```

Remove the duplicate from `contacts-panel.tsx` and import from `../constants` instead. Update `column-picker.tsx` to import from `../constants` as well.

- [ ] **Step 3c: Precompute apps-by-contact map**

In the `filtered` useMemo, build a lookup map at the top to avoid repeated O(applications) scans:

```ts
const filtered = useMemo(() => {
  const items = contacts ?? [];
  const apps = applications ?? [];
  const ctags = contactTags ?? [];

  // Precompute apps by contact — avoids O(contacts * apps) in filters and rendering
  const appsByContact = new Map<string, Application[]>();
  for (const app of apps) {
    if (!app.contact_id) continue;
    const list = appsByContact.get(app.contact_id);
    if (list) list.push(app);
    else appsByContact.set(app.contact_id, [app]);
  }

  let result = items;
  // ... existing filters use appsByContact.get(c.id) ?? [] instead of apps.filter(...)
```

Use `appsByContact.get(c.id) ?? []` everywhere that currently does `apps.filter((a) => a.contact_id === c.id)`, including in the program filter, column filter, and row rendering.

Export `appsByContact` from the useMemo (or compute it alongside `filtered`) so `renderFieldValue` can use it too.

- [ ] **Step 4: Render dynamic columns in the table**

In `src/app/(dashboard)/admin/contacts/contacts-panel.tsx`, compute the active field entries:

```ts
const activeFields = useMemo(
  () => visibleColumns.map(getFieldEntry).filter((f): f is FieldRegistryEntry => f !== undefined),
  [visibleColumns],
);
```

Add a helper to render a cell value for an application-derived field:

```ts
function renderFieldValue(
  contactApps: Application[],
  field: FieldRegistryEntry,
): React.ReactNode {
  const entries: { program: string; value: string }[] = [];

  for (const app of contactApps) {
    const raw = app.answers[field.key];
    if (raw == null) continue;

    let display: string;
    if (Array.isArray(raw)) {
      display = raw.join(", ");
    } else {
      display = String(raw);
    }
    entries.push({ program: app.program, value: display });
  }

  if (entries.length === 0) return "—";
  if (entries.length === 1) return entries[0].value;
  return entries.map((e) => `${e.program}: ${e.value}`).join(" · ");
}
```

In the TableHeader, add dynamic column heads after the Tags column:
```tsx
{activeFields.map((field) => (
  <TableHead key={field.key}>{field.label}</TableHead>
))}
```

In each TableRow, add dynamic cells after the Tags cell:
```tsx
{activeFields.map((field) => (
  <TableCell key={field.key} className="text-sm text-muted-foreground whitespace-nowrap">
    {renderFieldValue(contactApps, field)}
  </TableCell>
))}
```

- [ ] **Step 5: Verify the build compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/admin/contacts/
git commit -m "feat: add column visibility to contacts table with preference persistence"
```

---

## Task 5: Column Filtering

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/column-filter-popover.tsx`
- Modify: `src/app/(dashboard)/admin/contacts/contacts-panel.tsx`

- [ ] **Step 1: Create ColumnFilterPopover component**

Create `src/app/(dashboard)/admin/contacts/column-filter-popover.tsx`:

```tsx
"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import type { FieldRegistryEntry } from "./field-registry";

interface ColumnFilterPopoverProps {
  field: FieldRegistryEntry;
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}

export function ColumnFilterPopover({
  field,
  selected,
  onToggle,
  onClear,
}: ColumnFilterPopoverProps) {
  const hasActive = selected.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`ml-1 inline-flex items-center gap-0.5 rounded p-0.5 text-xs transition-colors ${
            hasActive
              ? "text-primary"
              : "text-muted-foreground/50 hover:text-muted-foreground"
          }`}
          aria-label={`Filter by ${field.label}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          {hasActive && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {selected.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="max-h-56 overflow-y-auto p-2">
          {field.options.map((option) => {
            const checked = selected.includes(option);
            return (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
              >
                <Checkbox checked={checked} onCheckedChange={() => onToggle(option)} />
                <span className="text-sm text-foreground">{option}</span>
              </label>
            );
          })}
        </div>
        {hasActive && (
          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={onClear}
              className="w-full rounded-md px-2 py-1 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Clear filter
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Add column filter state to ContactsPanel**

In `src/app/(dashboard)/admin/contacts/contacts-panel.tsx`:

Add import:
```ts
import { ColumnFilterPopover } from "./column-filter-popover";
```

Add state:
```ts
const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
```

Add handlers:
```ts
function handleColumnFilterToggle(fieldKey: string, value: string) {
  setColumnFilters((prev) => {
    const current = prev[fieldKey] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    if (next.length === 0) {
      const { [fieldKey]: _, ...rest } = prev;
      return rest;
    }
    return { ...prev, [fieldKey]: next };
  });
  setPage(1);
}

function handleColumnFilterClear(fieldKey: string) {
  setColumnFilters((prev) => {
    const { [fieldKey]: _, ...rest } = prev;
    return rest;
  });
  setPage(1);
}

function handleClearAllFilters() {
  setSearch("");
  setSelectedProgram(undefined);
  setSelectedTagIds([]);
  setColumnFilters({});
  setPage(1);
}
```

- [ ] **Step 3: Add column filter logic to the `filtered` useMemo**

Extend the `filtered` useMemo (after the existing tag filter block) to include column filters:

```ts
// Column filters (application-derived fields)
const activeColumnFilters = Object.entries(columnFilters);
if (activeColumnFilters.length > 0) {
  result = result.filter((c) => {
    const contactApps = apps.filter((a) => a.contact_id === c.id);
    return activeColumnFilters.every(([fieldKey, values]) =>
      contactApps.some((app) => {
        const raw = app.answers[fieldKey];
        if (raw == null) return false;
        if (Array.isArray(raw)) {
          return raw.some((v) => values.includes(String(v)));
        }
        return values.includes(String(raw));
      }),
    );
  });
}
```

Add `columnFilters` to the useMemo dependency array.

- [ ] **Step 4: Add filter icons to dynamic column headers**

Replace the dynamic column `<TableHead>` from Task 4 with:

```tsx
{activeFields.map((field) => (
  <TableHead key={field.key}>
    <span className="inline-flex items-center">
      {field.label}
      <ColumnFilterPopover
        field={field}
        selected={columnFilters[field.key] ?? []}
        onToggle={(v) => handleColumnFilterToggle(field.key, v)}
        onClear={() => handleColumnFilterClear(field.key)}
      />
    </span>
  </TableHead>
))}
```

- [ ] **Step 5: Add "Clear all filters" button**

Check if any filter is active:
```ts
const hasAnyFilter = search || selectedProgram || selectedTagIds.length > 0 || Object.keys(columnFilters).length > 0;
```

Add after the contacts count display (around the `{filtered.length} contact{...}` line):

```tsx
{hasAnyFilter && (
  <button
    type="button"
    onClick={handleClearAllFilters}
    className="ml-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
  >
    Clear all filters
  </button>
)}
```

- [ ] **Step 6: Verify the build compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/admin/contacts/
git commit -m "feat: add per-column filtering to contacts table"
```

---

## Task 6: Bulk Tag Assignment

**Files:**
- Create: `src/app/(dashboard)/admin/contacts/bulk-action-bar.tsx`
- Modify: `src/app/(dashboard)/admin/contacts/actions.ts` — add `bulkAssignTag`
- Modify: `src/lib/data/contacts.ts` — add `bulkAssignTags` data layer function
- Modify: `src/app/(dashboard)/admin/contacts/contacts-panel.tsx` — add selection + checkboxes
- Test: `src/app/(dashboard)/admin/contacts/actions.test.ts` — add bulkAssignTag tests

- [ ] **Step 1: Add bulkAssignTags to data layer**

Append to `src/lib/data/contacts.ts` (after the `unassignTag` function):

```ts
export async function bulkAssignTags(contactIds: string[], tagId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const rows = contactIds.map((contactId) => ({ contact_id: contactId, tag_id: tagId }));
  const { error } = await supabase
    .from("contact_tags")
    .upsert(rows, { onConflict: "contact_id,tag_id" });

  if (error) throw new Error(`Failed to bulk assign tags: ${error.message}`);
}
```

- [ ] **Step 2: Add bulkAssignTag server action**

In `src/app/(dashboard)/admin/contacts/actions.ts`, add import:

```ts
import {
  updateContact,
  assignTag,
  unassignTag,
  addContactNote,
  bulkAssignTags,
} from "@/lib/data/contacts";
```

Add the action:

```ts
const MAX_BULK_ASSIGN = 500;

export async function bulkAssignTag(contactIds: string[], tagId: string) {
  if (contactIds.length === 0) return;
  if (contactIds.length > MAX_BULK_ASSIGN) {
    throw new Error(`Cannot assign to more than ${MAX_BULK_ASSIGN} contacts at once`);
  }
  for (const id of contactIds) validateUUID(id, "contact");
  validateUUID(tagId, "tag");
  await requireAdmin();
  await bulkAssignTags(contactIds, tagId);
  revalidatePath("/admin");
}
```

- [ ] **Step 3: Add test for bulkAssignTag**

Add to `src/app/(dashboard)/admin/contacts/actions.test.ts`:

The `mockBulkAssignTags` mock and the `@/lib/data/contacts` mock already include `bulkAssignTags` from Task 3. Now extend the import and add the test suite.

Update the import line at the bottom of the mock section:

```ts
const { updatePreferences, bulkAssignTag } = await import("./actions");
```

Add test suite:

```ts
describe("bulkAssignTag", () => {
  beforeEach(() => {
    mockBulkAssignTags.mockResolvedValue({});
  });

  it("throws for invalid contact UUID", async () => {
    await expect(bulkAssignTag(["not-a-uuid"], VALID_UUID)).rejects.toThrow(
      "Invalid contact ID",
    );
    expect(mockBulkAssignTags).not.toHaveBeenCalled();
  });

  it("throws for invalid tag UUID", async () => {
    await expect(bulkAssignTag([VALID_UUID], "bad")).rejects.toThrow(
      "Invalid tag ID",
    );
    expect(mockBulkAssignTags).not.toHaveBeenCalled();
  });

  it("calls bulkAssignTags with valid input", async () => {
    const ids = [VALID_UUID, "660e8400-e29b-41d4-a716-446655440001"];
    await bulkAssignTag(ids, VALID_UUID);
    expect(mockBulkAssignTags).toHaveBeenCalledWith(ids, VALID_UUID);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm run test:unit -- --run src/app/\(dashboard\)/admin/contacts/actions.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Create BulkActionBar component**

Create `src/app/(dashboard)/admin/contacts/bulk-action-bar.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { TagCategory, Tag } from "@/types/database";
import { TAG_COLOR_CLASSES } from "../constants";
import { bulkAssignTag } from "./actions";

interface BulkActionBarProps {
  selectedCount: number;
  selectedIds: string[];
  tagCategories: TagCategory[];
  tags: Tag[];
  onClearSelection: () => void;
}

export function BulkActionBar({
  selectedCount,
  selectedIds,
  tagCategories,
  tags,
  onClearSelection,
}: BulkActionBarProps) {
  const [categoryId, setCategoryId] = useState<string>("");
  const [tagId, setTagId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const categoryTags = categoryId
    ? tags.filter((t) => t.category_id === categoryId)
    : [];

  function handleAssign() {
    if (!tagId) return;
    startTransition(async () => {
      try {
        await bulkAssignTag(selectedIds, tagId);
        toast.success(`Tag assigned to ${selectedCount} contact${selectedCount !== 1 ? "s" : ""}`);
        setCategoryId("");
        setTagId("");
      } catch {
        toast.error("Failed to assign tag. Please try again.");
      }
    });
  }

  const selectedCategory = tagCategories.find((c) => c.id === categoryId);
  const color = selectedCategory?.color ?? "blue";

  return (
    <div className="sticky bottom-0 z-10 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
      <span className="text-sm font-medium text-foreground">
        {selectedCount} selected
      </span>

      <select
        value={categoryId}
        onChange={(e) => { setCategoryId(e.target.value); setTagId(""); }}
        className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground"
      >
        <option value="">Category...</option>
        {tagCategories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {categoryId && (
        <select
          value={tagId}
          onChange={(e) => setTagId(e.target.value)}
          className={`rounded-md border px-3 py-1.5 text-sm ${TAG_COLOR_CLASSES[color] ?? "border-border bg-muted text-foreground"}`}
        >
          <option value="">Tag...</option>
          {categoryTags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={handleAssign}
        disabled={!tagId || isPending}
        className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Assigning..." : "Assign"}
      </button>

      <button
        type="button"
        onClick={onClearSelection}
        className="ml-auto text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Clear selection
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Add selection state and checkboxes to ContactsPanel**

In `src/app/(dashboard)/admin/contacts/contacts-panel.tsx`:

Add imports:
```ts
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "./bulk-action-bar";
```

Add selection state:
```ts
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

Clear selection whenever the visible contact set changes. Wrap all filter/page state changes through a helper:
```ts
function clearSelection() {
  setSelectedIds(new Set());
}
```

Call `clearSelection()` inside ALL handlers that change what's displayed:
- `onFilterChange` (search, program changes)
- `handleTagToggle` and `handleClearTags`
- `handleColumnFilterToggle` and `handleColumnFilterClear`
- `handleClearAllFilters`
- Page size buttons and pagination buttons (anywhere `setPage` is called)

Add selection handlers:
```ts
const allOnPageSelected = paginated.length > 0 && paginated.every((c) => selectedIds.has(c.id));

function handleSelectAll() {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (allOnPageSelected) {
      for (const c of paginated) next.delete(c.id);
    } else {
      for (const c of paginated) next.add(c.id);
    }
    return next;
  });
}

function handleSelectOne(contactId: string) {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(contactId)) next.delete(contactId);
    else next.add(contactId);
    return next;
  });
}
```

Add checkbox column to the table header (before the Name column):
```tsx
<TableHead className="w-10">
  <Checkbox
    checked={allOnPageSelected}
    onCheckedChange={handleSelectAll}
    aria-label="Select all on page"
  />
</TableHead>
```

Add checkbox cell to each row (before the Name cell):
```tsx
<TableCell className="w-10">
  <Checkbox
    checked={selectedIds.has(contact.id)}
    onCheckedChange={() => handleSelectOne(contact.id)}
    aria-label={`Select ${contact.name}`}
  />
</TableCell>
```

Add the BulkActionBar after the table (before pagination), only when items are selected:
```tsx
{selectedIds.size > 0 && (
  <BulkActionBar
    selectedCount={selectedIds.size}
    selectedIds={[...selectedIds]}
    tagCategories={tagCategories ?? []}
    tags={tags ?? []}
    onClearSelection={clearSelection}
  />
)}
```

- [ ] **Step 7: Verify the build compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 8: Run all tests**

```bash
npm run test:unit -- --run
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(dashboard\)/admin/contacts/ src/lib/data/contacts.ts
git commit -m "feat: add bulk tag assignment with multi-select to contacts table"
```

---

## Post-Implementation

After all tasks are complete:

1. **Remind user** to test locally and run `supabase db push` for the preferences migration
2. **Manual QA checklist:**
   - Toggle columns on/off via the Columns picker — verify columns appear/disappear
   - Refresh the page — verify saved columns persist
   - Open a column filter — select values — verify table filters correctly
   - Combine column filters with search, program, and tag filters — verify AND logic
   - Clear all filters — verify everything resets
   - Select contacts via checkboxes — select all on page — verify header checkbox
   - Use bulk action bar to assign a tag — verify toast and tag appears on contacts
   - Change page/filters — verify selection clears
