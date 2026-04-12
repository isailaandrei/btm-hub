import type { ProgramSlug } from "@/types/database";

import {
  // Shared — personal/background
  AGE_RANGES,
  GENDERS,
  // Shared — health
  FITNESS_LEVELS,
  HEALTH_CONDITIONS,
  // Shared — diving
  DIVING_TYPES,
  CERTIFICATION_LEVELS_SCUBA,
  NUMBER_OF_DIVES,
  DIVING_ENVIRONMENTS_SCUBA,
  INTERNSHIP_DIVING_ENVIRONMENTS,
  // Shared — logistics
  TIME_AVAILABILITY,
  TRAVEL_WILLINGNESS,
  BUDGETS,
  START_TIMELINES,
  PLANNING_TO_INVEST,
  REFERRAL_SOURCES,
  // Shared — BTM
  BTM_CATEGORIES_MEDIA,
  BTM_CATEGORIES_FREEDIVING,
  INVOLVEMENT_LEVELS,
  ONLINE_PRESENCE,
  LEARNING_APPROACHES,
  MEDIA_INCOME,
  YEARS_EXPERIENCE,
  // Filmmaking-specific
  FILMMAKING_EQUIPMENT,
  FILMMAKING_CONTENT_CREATED,
  FILMMAKING_GOALS,
  FILMMAKING_LEARNING_ASPECTS,
  FILMMAKING_CONTENT_TO_CREATE,
  MARINE_SUBJECTS_MEDIA,
  // Photography-specific
  PHOTOGRAPHY_EQUIPMENT,
  PHOTOGRAPHY_CONTENT_CREATED,
  PHOTOGRAPHY_GOALS,
  PHOTOGRAPHY_LEARNING_ASPECTS,
  PHOTOGRAPHY_CONTENT_TO_CREATE,
  // Freediving-specific
  FREEDIVING_CERTIFICATION_LEVELS,
  NUMBER_OF_SESSIONS,
  PRACTICE_DURATION,
  PERFORMANCE_EXPERIENCE,
  FREEDIVING_ENVIRONMENTS,
  CHOREOGRAPHY_EXPERIENCE,
  FILMED_UNDERWATER,
  FREEDIVING_LEARNING_ASPECTS,
  FREEDIVING_GOALS,
} from "@/lib/academy/forms/common/options";

export interface FieldRegistryEntry {
  key: string;
  label: string;
  type: "select" | "multiselect" | "rating" | "date";
  options: readonly string[] | string[];
  programs: ProgramSlug[];
  curated: boolean;
  /**
   * Optional canonical bucket mapping. When set:
   * - The column filter dropdown shows `canonical.options` instead of
   *   the raw `options` list.
   * - The filter predicate runs each stored answer through `normalize(raw)`
   *   before comparing against the selected filter values, so values that
   *   share a canonical bucket (e.g., internship numeric "21" and
   *   filmmaking "18-24") match the same filter entry.
   * - The sort comparator uses the same normalization, keeping cross-
   *   program sort order stable.
   * Values for which `normalize` returns null fall through to the
   * synthetic "Other" filter bucket.
   */
  canonical?: {
    options: readonly string[];
    normalize: (raw: unknown) => string | null;
  };
}

/**
 * Maps a raw `answers.age` value to its canonical AGE_RANGES bucket.
 * Handles the three shapes partner A's Google Forms emit today:
 *   - Canonical range string ("18-24", "25-34", …) → passthrough
 *   - Numeric internship text ("21", "30", …)     → bucketed
 *   - Free-text variants ("24 years old", "30 year old") → bucketed
 * Returns null for anything that can't be mapped to a canonical bucket
 * (empty, non-string, non-numeric, or below the curated range ≥18).
 */
export function normalizeAgeToRange(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if ((AGE_RANGES as readonly string[]).includes(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,3})(?:\s+years?\s+old)?$/i);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 18) return null;
  if (n <= 24) return "18-24";
  if (n <= 34) return "25-34";
  if (n <= 44) return "35-44";
  if (n <= 54) return "45-54";
  return "55+";
}

const RATING_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/** Deduplicated union of multiple option arrays (first-seen ordering). */
function union(...arrays: (readonly string[])[]): string[] {
  return [...new Set(arrays.flat())];
}

export const FIELD_REGISTRY: FieldRegistryEntry[] = [
  // ---- Curated (shown upfront in column picker) ----
  {
    key: "budget",
    label: "Budget",
    type: "select",
    options: BUDGETS,
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "time_availability",
    label: "Time Availability",
    type: "select",
    options: TIME_AVAILABILITY,
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "start_timeline",
    label: "Start Timeline",
    type: "select",
    options: START_TIMELINES,
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "btm_category",
    label: "Professional Status",
    type: "select",
    options: union(BTM_CATEGORIES_MEDIA, BTM_CATEGORIES_FREEDIVING),
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "certification_level",
    label: "Certification Level",
    type: "multiselect",
    options: union(
      CERTIFICATION_LEVELS_SCUBA,
      FREEDIVING_CERTIFICATION_LEVELS,
    ),
    programs: ["filmmaking", "photography", "freediving", "internship"],
    curated: true,
  },
  {
    key: "years_experience",
    label: "Years of Experience",
    type: "select",
    options: YEARS_EXPERIENCE,
    programs: ["filmmaking", "photography"],
    curated: true,
  },
  {
    key: "involvement_level",
    label: "Involvement Level",
    type: "select",
    options: INVOLVEMENT_LEVELS,
    programs: ["filmmaking", "photography"],
    curated: true,
  },
  {
    key: "travel_willingness",
    label: "Travel Willingness",
    type: "select",
    options: TRAVEL_WILLINGNESS,
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },

  // ---- Personal & Health (all programs) ----
  {
    key: "age",
    label: "Age Range",
    type: "select",
    options: AGE_RANGES,
    programs: ["filmmaking", "photography", "freediving", "internship"],
    curated: false,
    // Internship applications store age as raw numeric text ("21", "30",
    // "24 years old") rather than a range string. Canonical normalization
    // maps any shape to the AGE_RANGES buckets so a filter on "18-24"
    // catches both "18-24" (f/p/fd) and "21" (internship) rows.
    canonical: {
      options: AGE_RANGES,
      normalize: normalizeAgeToRange,
    },
  },
  {
    key: "gender",
    label: "Gender",
    type: "select",
    options: GENDERS,
    programs: ["filmmaking", "photography", "freediving", "internship"],
    curated: false,
  },
  {
    key: "physical_fitness",
    label: "Physical Fitness",
    type: "select",
    options: FITNESS_LEVELS,
    programs: ["filmmaking", "photography", "freediving", "internship"],
    curated: false,
  },
  {
    key: "health_conditions",
    label: "Health Conditions",
    type: "select",
    options: HEALTH_CONDITIONS,
    programs: ["filmmaking", "photography", "internship"],
    curated: false,
  },

  // ---- Diving (filmmaking + photography + internship) ----
  {
    key: "diving_types",
    label: "Types of Diving",
    type: "multiselect",
    options: DIVING_TYPES,
    programs: ["filmmaking", "photography", "internship"],
    curated: false,
  },
  {
    key: "number_of_dives",
    label: "Number of Dives",
    type: "select",
    options: NUMBER_OF_DIVES,
    programs: ["filmmaking", "photography", "internship"],
    curated: false,
  },
  {
    key: "diving_environments",
    label: "Diving Environments",
    type: "multiselect",
    options: union(
      DIVING_ENVIRONMENTS_SCUBA,
      INTERNSHIP_DIVING_ENVIRONMENTS,
      FREEDIVING_ENVIRONMENTS,
    ),
    programs: ["filmmaking", "photography", "freediving", "internship"],
    curated: false,
  },

  // ---- Equipment ----
  {
    key: "planning_to_invest",
    label: "Planning to Invest",
    type: "select",
    options: PLANNING_TO_INVEST,
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "equipment_owned",
    label: "Equipment Owned",
    type: "multiselect",
    options: union(FILMMAKING_EQUIPMENT, PHOTOGRAPHY_EQUIPMENT),
    programs: ["filmmaking", "photography"],
    curated: false,
  },

  // ---- Creative Profile ----
  {
    key: "content_created",
    label: "Content Created",
    type: "multiselect",
    options: union(FILMMAKING_CONTENT_CREATED, PHOTOGRAPHY_CONTENT_CREATED),
    programs: ["filmmaking", "photography", "internship"],
    curated: false,
  },
  {
    key: "online_presence",
    label: "Online Presence",
    type: "multiselect",
    options: ONLINE_PRESENCE,
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "income_from_filming",
    label: "Income from Filming",
    type: "select",
    options: MEDIA_INCOME,
    programs: ["filmmaking"],
    curated: false,
  },
  {
    key: "income_from_photography",
    label: "Income from Photography",
    type: "select",
    options: MEDIA_INCOME,
    programs: ["photography"],
    curated: false,
  },

  // ---- Goals ----
  {
    key: "primary_goal",
    label: "Primary Goal",
    type: "select",
    options: union(FILMMAKING_GOALS, PHOTOGRAPHY_GOALS, FREEDIVING_GOALS),
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "learning_aspects",
    label: "Learning Aspects",
    type: "multiselect",
    options: union(
      FILMMAKING_LEARNING_ASPECTS,
      PHOTOGRAPHY_LEARNING_ASPECTS,
      FREEDIVING_LEARNING_ASPECTS,
    ),
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "content_to_create",
    label: "Content to Create",
    type: "multiselect",
    options: union(FILMMAKING_CONTENT_TO_CREATE, PHOTOGRAPHY_CONTENT_TO_CREATE),
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "learning_approach",
    label: "Learning Approach",
    type: "multiselect",
    options: LEARNING_APPROACHES,
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "marine_subjects",
    label: "Marine Subjects",
    type: "multiselect",
    options: MARINE_SUBJECTS_MEDIA,
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "referral_source",
    label: "Referral Source",
    type: "multiselect",
    options: REFERRAL_SOURCES,
    programs: ["filmmaking", "photography", "freediving", "internship"],
    curated: false,
  },

  // ---- Freediving-specific selects ----
  {
    key: "number_of_sessions",
    label: "Freediving Sessions",
    type: "select",
    options: NUMBER_OF_SESSIONS,
    programs: ["freediving"],
    curated: false,
  },
  {
    key: "practice_duration",
    label: "Practice Duration",
    type: "select",
    options: PRACTICE_DURATION,
    programs: ["freediving"],
    curated: false,
  },
  {
    key: "performance_experience",
    label: "Performance Experience",
    type: "select",
    options: PERFORMANCE_EXPERIENCE,
    programs: ["freediving"],
    curated: false,
  },
  {
    key: "choreography_experience",
    label: "Choreography Experience",
    type: "select",
    options: CHOREOGRAPHY_EXPERIENCE,
    programs: ["freediving"],
    curated: false,
  },
  {
    key: "filmed_underwater",
    label: "Filmed Underwater",
    type: "select",
    options: FILMED_UNDERWATER,
    programs: ["freediving"],
    curated: false,
  },

  // ---- Ratings: Filmmaking + Photography shared ----
  {
    key: "buoyancy_skill",
    label: "Buoyancy Skill",
    type: "rating",
    options: RATING_OPTIONS,
    programs: ["filmmaking", "photography", "internship"],
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
