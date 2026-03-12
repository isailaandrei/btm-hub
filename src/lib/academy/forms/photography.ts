import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

export interface StepDefinition {
  id: string;
  title: string;
  description: string;
}

export const PHOTOGRAPHY_STEPS: StepDefinition[] = [
  {
    id: "personal",
    title: "Personal Information",
    description: "Tell us a bit about yourself so we can get to know you.",
  },
  {
    id: "background",
    title: "Background",
    description: "Where are you from and what do you do?",
  },
  {
    id: "health",
    title: "Health & Fitness",
    description:
      "Help us understand your physical readiness for underwater activities.",
  },
  {
    id: "diving",
    title: "Diving Experience",
    description: "Tell us about your diving background and comfort level.",
  },
  {
    id: "equipment",
    title: "Equipment",
    description: "What gear do you currently own or plan to acquire?",
  },
  {
    id: "skills",
    title: "Photography Skills",
    description: "Rate your current skill levels honestly — there are no wrong answers.",
  },
  {
    id: "creative_profile",
    title: "Creative Profile",
    description: "Help us understand your creative journey and online presence.",
  },
  {
    id: "goals",
    title: "Goals & Learning",
    description: "What do you want to achieve through the program?",
  },
  {
    id: "logistics",
    title: "Logistics",
    description: "Practical details about your availability and commitment.",
  },
  {
    id: "open_questions",
    title: "Open Questions",
    description: "Share your vision, motivation, and anything else we should know.",
  },
];

// ---------------------------------------------------------------------------
// Option lists (as const for type safety)
// ---------------------------------------------------------------------------

export const AGE_RANGES = [
  "Under 18",
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
] as const;

export const GENDERS = [
  "Male",
  "Female",
  "Non-binary",
  "Prefer not to say",
] as const;

export const FITNESS_LEVELS = [
  "Low",
  "Moderate",
  "Good",
  "Excellent",
] as const;

export const HEALTH_CONDITIONS = [
  "None",
  "Minor conditions (managed)",
  "Conditions that may affect diving",
] as const;

export const DIVING_TYPES = [
  "Scuba diving",
  "Freediving",
  "Snorkeling",
  "Technical diving",
  "Rebreather diving",
] as const;

export const CERTIFICATION_LEVELS = [
  "None",
  "Open Water (OW)",
  "Advanced Open Water (AOW)",
  "Rescue Diver",
  "Divemaster",
  "Instructor",
] as const;

export const NUMBER_OF_DIVES = [
  "0-10",
  "11-50",
  "51-100",
  "101-500",
  "500+",
] as const;

export const DIVING_ENVIRONMENTS = [
  "Reef",
  "Wreck",
  "Cave / Cavern",
  "Open water",
  "Freshwater",
  "Cold water",
  "Muck diving",
] as const;

export const EQUIPMENT_OWNED = [
  "Camera",
  "Underwater housing",
  "Strobes / Lights",
  "Wide-angle lens",
  "Macro lens",
  "Drone",
  "Video lights",
  "Editing software",
] as const;

export const PLANNING_TO_INVEST = [
  "Yes, significant investment planned",
  "Yes, moderate investment planned",
  "Small investment planned",
  "No investment planned at this time",
] as const;

export const YEARS_EXPERIENCE = [
  "Less than 1 year",
  "1-2 years",
  "3-5 years",
  "5-10 years",
  "10+ years",
] as const;

export const CONTENT_CREATED = [
  "Stills — underwater",
  "Stills — topside",
  "Video — underwater",
  "Video — topside",
  "Drone footage",
  "360 / VR",
  "Social media content",
] as const;

export const BTM_CATEGORIES = [
  "Beginner",
  "Enthusiast",
  "Semi-professional",
  "Professional",
] as const;

export const INVOLVEMENT_LEVELS = [
  "Hobby",
  "Part-time",
  "Full-time",
  "Transitioning to full-time",
] as const;

export const ONLINE_PRESENCE = [
  "None",
  "Personal social media only",
  "Dedicated photography social media",
  "Website / portfolio",
  "Multiple platforms",
] as const;

export const INCOME_FROM_PHOTOGRAPHY = [
  "None",
  "Occasional / side income",
  "Part of my income",
  "Primary income source",
] as const;

export const PRIMARY_GOALS = [
  "Learn underwater photography from scratch",
  "Improve existing skills",
  "Transition to professional",
  "Build a portfolio",
  "Content creation",
  "Conservation / scientific documentation",
] as const;

export const LEARNING_ASPECTS = [
  "Camera settings & exposure",
  "Lighting techniques",
  "Composition",
  "Post-production / editing",
  "Wide-angle photography",
  "Macro photography",
  "Video / filmmaking",
  "Business & marketing",
  "Conservation storytelling",
] as const;

export const CONTENT_TO_CREATE = [
  "Social media content",
  "Fine art prints",
  "Editorial / magazine",
  "Conservation / documentary",
  "Commercial / stock",
  "Personal portfolio",
  "Educational content",
] as const;

export const LEARNING_APPROACHES = [
  "One-on-one mentorship",
  "Group workshops",
  "Online courses",
  "Self-paced learning",
  "Field trips",
  "Portfolio reviews",
] as const;

export const MARINE_SUBJECTS = [
  "Coral reefs",
  "Large marine life (sharks, rays, whales)",
  "Macro / small creatures",
  "Wrecks",
  "Underwater landscapes / scenery",
  "Marine conservation",
  "Freediving / human subjects",
  "Cave / cenote environments",
] as const;

export const TIME_AVAILABILITY = [
  "1-2 weeks",
  "2-4 weeks",
  "1-3 months",
  "3-6 months",
  "6+ months",
  "Flexible",
] as const;

export const TRAVEL_WILLINGNESS = [
  "Yes, anywhere",
  "Yes, within my region",
  "Limited travel",
  "Prefer remote / online only",
] as const;

export const BUDGETS = [
  "Under $1,000",
  "$1,000 - $3,000",
  "$3,000 - $5,000",
  "$5,000 - $10,000",
  "$10,000+",
] as const;

export const START_TIMELINES = [
  "Immediately",
  "Within 1 month",
  "Within 3 months",
  "Within 6 months",
  "Within a year",
  "Not sure yet",
] as const;

export const REFERRAL_SOURCES = [
  "Social media",
  "Friend / family",
  "Google search",
  "BTM website",
  "Dive center / club",
  "Photography community",
  "Event / exhibition",
  "Other",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rating = z.number().int().min(1).max(10);

const atLeastOne = (arr: z.ZodType<string[]>, message = "Select at least one option") =>
  arr.check(z.minLength(1, message));

// ---------------------------------------------------------------------------
// Full schema (all 51 fields)
// ---------------------------------------------------------------------------

export const photographyAnswersSchema = z.object({
  // Step 1 — Personal
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  nickname: z.string().min(1, "Nickname is required"),
  email: z.email("Please enter a valid email"),
  phone: z.string().min(1, "Phone number is required"),
  age: z.enum(AGE_RANGES),
  gender: z.enum(GENDERS),

  // Step 2 — Background
  nationality: z.string().min(1, "Nationality is required"),
  country_of_residence: z.string().min(1, "Country of residence is required"),
  languages: atLeastOne(z.array(z.string()), "Select at least one language"),
  current_occupation: z.string().min(1, "Current occupation is required"),

  // Step 3 — Health
  physical_fitness: z.enum(FITNESS_LEVELS),
  health_conditions: z.enum(HEALTH_CONDITIONS),
  health_details: z.string().optional(),

  // Step 4 — Diving
  diving_types: atLeastOne(z.array(z.enum(DIVING_TYPES))),
  certification_level: z.enum(CERTIFICATION_LEVELS),
  certification_details: z.string().optional(),
  number_of_dives: z.enum(NUMBER_OF_DIVES),
  last_dive_date: z.string().min(1, "Last dive date is required"),
  diving_environments: atLeastOne(z.array(z.enum(DIVING_ENVIRONMENTS))),
  buoyancy_skill: rating,

  // Step 5 — Equipment
  equipment_owned: z.array(z.enum(EQUIPMENT_OWNED)),
  photography_equipment: z.string().min(1, "Please describe your photography equipment"),
  planning_to_invest: z.enum(PLANNING_TO_INVEST),

  // Step 6 — Skills
  years_experience: z.enum(YEARS_EXPERIENCE),
  skill_camera_settings: rating,
  skill_lighting: rating,
  skill_post_production: rating,
  skill_color_correction: rating,
  skill_composition: rating,
  skill_drone: rating,
  skill_over_water: rating,

  // Step 7 — Creative Profile
  content_created: atLeastOne(z.array(z.enum(CONTENT_CREATED))),
  btm_category: z.enum(BTM_CATEGORIES),
  involvement_level: z.enum(INVOLVEMENT_LEVELS),
  online_presence: z.enum(ONLINE_PRESENCE),
  online_links: z.string().optional(),
  income_from_photography: z.enum(INCOME_FROM_PHOTOGRAPHY),

  // Step 8 — Goals
  primary_goal: z.enum(PRIMARY_GOALS),
  secondary_goal: z.string().optional(),
  learning_aspects: atLeastOne(z.array(z.enum(LEARNING_ASPECTS))),
  content_to_create: atLeastOne(z.array(z.enum(CONTENT_TO_CREATE))),
  learning_approach: atLeastOne(z.array(z.enum(LEARNING_APPROACHES))),
  marine_subjects: atLeastOne(z.array(z.enum(MARINE_SUBJECTS))),

  // Step 9 — Logistics
  time_availability: z.enum(TIME_AVAILABILITY),
  travel_willingness: z.enum(TRAVEL_WILLINGNESS),
  budget: z.enum(BUDGETS),
  start_timeline: z.enum(START_TIMELINES),

  // Step 10 — Open Questions
  ultimate_vision: z.string().min(10, "Please share at least a short answer (10+ characters)"),
  inspiration_to_apply: z.string().min(10, "Please share at least a short answer (10+ characters)"),
  referral_source: atLeastOne(z.array(z.enum(REFERRAL_SOURCES))),
  questions_or_concerns: z.string().optional(),
  anything_else: z.string().optional(),
});

export type PhotographyAnswers = z.infer<typeof photographyAnswersSchema>;

// ---------------------------------------------------------------------------
// Per-step validation schemas
// ---------------------------------------------------------------------------

export const photographyStepSchemas: Record<string, z.ZodType> = {
  personal: z.object({
    first_name: z.string().min(1, "First name is required"),
    last_name: z.string().min(1, "Last name is required"),
    nickname: z.string().min(1, "Nickname is required"),
    email: z.email("Please enter a valid email"),
    phone: z.string().min(1, "Phone number is required"),
    age: z.enum(AGE_RANGES),
    gender: z.enum(GENDERS),
  }),

  background: z.object({
    nationality: z.string().min(1, "Nationality is required"),
    country_of_residence: z.string().min(1, "Country of residence is required"),
    languages: atLeastOne(z.array(z.string()), "Select at least one language"),
    current_occupation: z.string().min(1, "Current occupation is required"),
  }),

  health: z.object({
    physical_fitness: z.enum(FITNESS_LEVELS),
    health_conditions: z.enum(HEALTH_CONDITIONS),
    health_details: z.string().optional(),
  }),

  diving: z.object({
    diving_types: atLeastOne(z.array(z.enum(DIVING_TYPES))),
    certification_level: z.enum(CERTIFICATION_LEVELS),
    certification_details: z.string().optional(),
    number_of_dives: z.enum(NUMBER_OF_DIVES),
    last_dive_date: z.string().min(1, "Last dive date is required"),
    diving_environments: atLeastOne(z.array(z.enum(DIVING_ENVIRONMENTS))),
    buoyancy_skill: rating,
  }),

  equipment: z.object({
    equipment_owned: z.array(z.enum(EQUIPMENT_OWNED)),
    photography_equipment: z.string().min(1, "Please describe your photography equipment"),
    planning_to_invest: z.enum(PLANNING_TO_INVEST),
  }),

  skills: z.object({
    years_experience: z.enum(YEARS_EXPERIENCE),
    skill_camera_settings: rating,
    skill_lighting: rating,
    skill_post_production: rating,
    skill_color_correction: rating,
    skill_composition: rating,
    skill_drone: rating,
    skill_over_water: rating,
  }),

  creative_profile: z.object({
    content_created: atLeastOne(z.array(z.enum(CONTENT_CREATED))),
    btm_category: z.enum(BTM_CATEGORIES),
    involvement_level: z.enum(INVOLVEMENT_LEVELS),
    online_presence: z.enum(ONLINE_PRESENCE),
    online_links: z.string().optional(),
    income_from_photography: z.enum(INCOME_FROM_PHOTOGRAPHY),
  }),

  goals: z.object({
    primary_goal: z.enum(PRIMARY_GOALS),
    secondary_goal: z.string().optional(),
    learning_aspects: atLeastOne(z.array(z.enum(LEARNING_ASPECTS))),
    content_to_create: atLeastOne(z.array(z.enum(CONTENT_TO_CREATE))),
    learning_approach: atLeastOne(z.array(z.enum(LEARNING_APPROACHES))),
    marine_subjects: atLeastOne(z.array(z.enum(MARINE_SUBJECTS))),
  }),

  logistics: z.object({
    time_availability: z.enum(TIME_AVAILABILITY),
    travel_willingness: z.enum(TRAVEL_WILLINGNESS),
    budget: z.enum(BUDGETS),
    start_timeline: z.enum(START_TIMELINES),
  }),

  open_questions: z.object({
    ultimate_vision: z.string().min(10, "Please share at least a short answer (10+ characters)"),
    inspiration_to_apply: z.string().min(10, "Please share at least a short answer (10+ characters)"),
    referral_source: atLeastOne(z.array(z.enum(REFERRAL_SOURCES))),
    questions_or_concerns: z.string().optional(),
    anything_else: z.string().optional(),
  }),
};
