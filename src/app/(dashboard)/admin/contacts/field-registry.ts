import type { ProgramSlug } from "@/types/database";

// Shared options (all programs or filmmaking+photography)
import {
  CERTIFICATION_LEVELS,
  NUMBER_OF_DIVES,
  DIVING_TYPES,
  DIVING_ENVIRONMENTS,
  BTM_CATEGORIES,
  TIME_AVAILABILITY,
  TRAVEL_WILLINGNESS,
  BUDGETS,
  START_TIMELINES,
  PLANNING_TO_INVEST,
  YEARS_EXPERIENCE,
  INVOLVEMENT_LEVELS,
  REFERRAL_SOURCES,
  EQUIPMENT_OWNED,
  CONTENT_CREATED,
  ONLINE_PRESENCE,
  INCOME_FROM_PHOTOGRAPHY,
  PRIMARY_GOALS,
  LEARNING_ASPECTS,
  CONTENT_TO_CREATE,
  LEARNING_APPROACHES,
  MARINE_SUBJECTS,
} from "@/lib/academy/forms/common/options";
import { AGE_RANGES, GENDERS } from "@/lib/academy/forms/common/personal";
import { FITNESS_LEVELS, HEALTH_CONDITIONS } from "@/lib/academy/forms/common/health";

// Filmmaking-specific options
import {
  FILMMAKING_EQUIPMENT_OWNED,
  FILMMAKING_CONTENT_CREATED,
  FILMMAKING_ONLINE_PRESENCE,
  INCOME_FROM_FILMING,
  FILMMAKING_PRIMARY_GOALS,
  FILMMAKING_LEARNING_ASPECTS,
  FILMMAKING_CONTENT_TO_CREATE,
  FILMMAKING_LEARNING_APPROACHES,
  FILMMAKING_MARINE_SUBJECTS,
} from "@/lib/academy/forms/filmmaking";

// Freediving-specific options
import {
  FREEDIVING_CERTIFICATION_LEVELS,
  NUMBER_OF_SESSIONS,
  PRACTICE_DURATION,
  FREEDIVING_ENVIRONMENTS,
  PERFORMANCE_EXPERIENCE,
  CHOREOGRAPHY_EXPERIENCE,
  FILMED_UNDERWATER,
  FREEDIVING_BTM_CATEGORIES,
  FREEDIVING_ONLINE_PRESENCE,
  FREEDIVING_LEARNING_ASPECTS,
  FREEDIVING_LEARNING_APPROACHES,
} from "@/lib/academy/forms/freediving-modelling";

export interface FieldRegistryEntry {
  key: string;
  label: string;
  type: "select" | "multiselect" | "rating";
  options: readonly string[] | string[];
  programs: ProgramSlug[];
  curated: boolean;
}

const RATING_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/** Deduplicated union of multiple option arrays. */
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
    label: "BTM Category",
    type: "select",
    options: union(BTM_CATEGORIES, FREEDIVING_BTM_CATEGORIES),
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "certification_level",
    label: "Certification Level",
    type: "select",
    options: union(CERTIFICATION_LEVELS, FREEDIVING_CERTIFICATION_LEVELS),
    programs: ["filmmaking", "photography", "freediving"],
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
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "gender",
    label: "Gender",
    type: "select",
    options: GENDERS,
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "physical_fitness",
    label: "Physical Fitness",
    type: "select",
    options: FITNESS_LEVELS,
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "health_conditions",
    label: "Health Conditions",
    type: "select",
    options: HEALTH_CONDITIONS,
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },

  // ---- Diving (filmmaking + photography) ----
  {
    key: "diving_types",
    label: "Types of Diving",
    type: "multiselect",
    options: DIVING_TYPES,
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "number_of_dives",
    label: "Number of Dives",
    type: "select",
    options: NUMBER_OF_DIVES,
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "diving_environments",
    label: "Diving Environments",
    type: "multiselect",
    options: union(DIVING_ENVIRONMENTS, FREEDIVING_ENVIRONMENTS),
    programs: ["filmmaking", "photography", "freediving"],
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
    options: union(FILMMAKING_EQUIPMENT_OWNED, EQUIPMENT_OWNED),
    programs: ["filmmaking", "photography"],
    curated: false,
  },

  // ---- Creative Profile ----
  {
    key: "content_created",
    label: "Content Created",
    type: "multiselect",
    options: union(FILMMAKING_CONTENT_CREATED, CONTENT_CREATED),
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "online_presence",
    label: "Online Presence",
    type: "select",
    options: union(FILMMAKING_ONLINE_PRESENCE, ONLINE_PRESENCE, FREEDIVING_ONLINE_PRESENCE),
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "income_from_filming",
    label: "Income from Filming",
    type: "select",
    options: INCOME_FROM_FILMING,
    programs: ["filmmaking"],
    curated: false,
  },
  {
    key: "income_from_photography",
    label: "Income from Photography",
    type: "select",
    options: INCOME_FROM_PHOTOGRAPHY,
    programs: ["photography"],
    curated: false,
  },

  // ---- Goals ----
  {
    key: "primary_goal",
    label: "Primary Goal",
    type: "select",
    options: union(FILMMAKING_PRIMARY_GOALS, PRIMARY_GOALS),
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "learning_aspects",
    label: "Learning Aspects",
    type: "multiselect",
    options: union(FILMMAKING_LEARNING_ASPECTS, LEARNING_ASPECTS, FREEDIVING_LEARNING_ASPECTS),
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "content_to_create",
    label: "Content to Create",
    type: "multiselect",
    options: union(FILMMAKING_CONTENT_TO_CREATE, CONTENT_TO_CREATE),
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "learning_approach",
    label: "Learning Approach",
    type: "multiselect",
    options: union(FILMMAKING_LEARNING_APPROACHES, LEARNING_APPROACHES, FREEDIVING_LEARNING_APPROACHES),
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "marine_subjects",
    label: "Marine Subjects",
    type: "multiselect",
    options: union(FILMMAKING_MARINE_SUBJECTS, MARINE_SUBJECTS),
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "referral_source",
    label: "Referral Source",
    type: "multiselect",
    options: REFERRAL_SOURCES,
    programs: ["filmmaking", "photography", "freediving"],
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
