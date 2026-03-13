import type { FieldDefinition, FormStepDefinition, FormDefinition } from "./types";
import { personalStep } from "./common/personal";
import { backgroundStep } from "./common/background";
import { healthStep } from "./common/health";
import { registerForm } from "./registry";

// ---------------------------------------------------------------------------
// Photography-specific option lists
// ---------------------------------------------------------------------------

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
// Photography-specific steps
// ---------------------------------------------------------------------------

const divingFields: FieldDefinition[] = [
  { type: "multiselect", name: "diving_types", label: "Types of Diving", options: DIVING_TYPES, required: true },
  { type: "select", name: "certification_level", label: "Certification Level", options: CERTIFICATION_LEVELS, required: true },
  { type: "text", name: "certification_details", label: "Certification Details (optional)", placeholder: "Agency, cert number, etc.", required: false, visibleWhen: { field: "certification_level", operator: "neq", value: "None" } },
  { type: "select", name: "number_of_dives", label: "Number of Dives", options: NUMBER_OF_DIVES, required: true },
  { type: "date", name: "last_dive_date", label: "Last Dive Date", required: true },
  { type: "multiselect", name: "diving_environments", label: "Diving Environments", options: DIVING_ENVIRONMENTS, required: true },
  { type: "rating", name: "buoyancy_skill", label: "Buoyancy Skill (1 = beginner, 10 = expert)" },
];

const divingStep: FormStepDefinition = {
  id: "diving",
  title: "Diving Experience",
  description: "Tell us about your diving background and comfort level.",
  fields: divingFields,
};

const equipmentFields: FieldDefinition[] = [
  { type: "multiselect", name: "equipment_owned", label: "Equipment Owned", options: EQUIPMENT_OWNED, required: false },
  { type: "text", multiline: true, name: "photography_equipment", label: "Describe Your Photography Equipment", placeholder: "Camera body, lenses, housing, lights, editing software...", required: true },
  { type: "select", name: "planning_to_invest", label: "Planning to Invest in New Equipment?", options: PLANNING_TO_INVEST, required: true },
];

const equipmentStep: FormStepDefinition = {
  id: "equipment",
  title: "Equipment",
  description: "What gear do you currently own or plan to acquire?",
  fields: equipmentFields,
};

const skillsFields: FieldDefinition[] = [
  { type: "select", name: "years_experience", label: "Years of Photography Experience", options: YEARS_EXPERIENCE, required: true },
  { type: "rating", name: "skill_camera_settings", label: "Camera Settings & Exposure" },
  { type: "rating", name: "skill_lighting", label: "Lighting" },
  { type: "rating", name: "skill_post_production", label: "Post-Production" },
  { type: "rating", name: "skill_color_correction", label: "Color Correction" },
  { type: "rating", name: "skill_composition", label: "Composition" },
  { type: "rating", name: "skill_drone", label: "Drone Operation" },
  { type: "rating", name: "skill_over_water", label: "Over-Water Photography" },
];

const skillsStep: FormStepDefinition = {
  id: "skills",
  title: "Photography Skills",
  description: "Rate your current skill levels honestly — there are no wrong answers.",
  fields: skillsFields,
};

const creativeProfileFields: FieldDefinition[] = [
  { type: "multiselect", name: "content_created", label: "Content You've Created", options: CONTENT_CREATED, required: true },
  { type: "select", name: "btm_category", label: "How Would You Categorize Yourself?", options: BTM_CATEGORIES, required: true },
  { type: "select", name: "involvement_level", label: "Level of Involvement in Photography", options: INVOLVEMENT_LEVELS, required: true },
  { type: "select", name: "online_presence", label: "Online Presence", options: ONLINE_PRESENCE, required: true },
  { type: "text", name: "online_links", label: "Links to Your Work (optional)", placeholder: "Instagram, website, portfolio...", required: false },
  { type: "select", name: "income_from_photography", label: "Income from Photography", options: INCOME_FROM_PHOTOGRAPHY, required: true },
];

const creativeProfileStep: FormStepDefinition = {
  id: "creative_profile",
  title: "Creative Profile",
  description: "Help us understand your creative journey and online presence.",
  fields: creativeProfileFields,
};

const goalsFields: FieldDefinition[] = [
  { type: "select", name: "primary_goal", label: "Primary Goal", options: PRIMARY_GOALS, required: true },
  { type: "text", name: "secondary_goal", label: "Secondary Goal (optional)", placeholder: "Any other goals you'd like to achieve?", required: false },
  { type: "multiselect", name: "learning_aspects", label: "Aspects You Want to Learn", options: LEARNING_ASPECTS, required: true },
  { type: "multiselect", name: "content_to_create", label: "Content You Want to Create", options: CONTENT_TO_CREATE, required: true },
  { type: "multiselect", name: "learning_approach", label: "Preferred Learning Approach", options: LEARNING_APPROACHES, required: true },
  { type: "multiselect", name: "marine_subjects", label: "Marine Subjects of Interest", options: MARINE_SUBJECTS, required: true },
];

const goalsStep: FormStepDefinition = {
  id: "goals",
  title: "Goals & Learning",
  description: "What do you want to achieve through the program?",
  fields: goalsFields,
};

const logisticsFields: FieldDefinition[] = [
  { type: "select", name: "time_availability", label: "Time Availability", options: TIME_AVAILABILITY, required: true },
  { type: "select", name: "travel_willingness", label: "Willingness to Travel", options: TRAVEL_WILLINGNESS, required: true },
  { type: "select", name: "budget", label: "Budget", options: BUDGETS, required: true },
  { type: "select", name: "start_timeline", label: "When Can You Start?", options: START_TIMELINES, required: true },
];

const logisticsStep: FormStepDefinition = {
  id: "logistics",
  title: "Logistics",
  description: "Practical details about your availability and commitment.",
  fields: logisticsFields,
};

const openQuestionsFields: FieldDefinition[] = [
  { type: "text", multiline: true, name: "ultimate_vision", label: "What is your ultimate vision for your underwater photography career or journey?", minLength: 10, required: true },
  { type: "text", multiline: true, name: "inspiration_to_apply", label: "What inspired you to apply to the BTM Academy?", minLength: 10, required: true },
  { type: "multiselect", name: "referral_source", label: "How Did You Hear About Us?", options: REFERRAL_SOURCES, required: true },
  { type: "text", multiline: true, name: "questions_or_concerns", label: "Questions or Concerns (optional)", placeholder: "Anything you'd like to ask or flag before submitting?", required: false },
  { type: "text", multiline: true, name: "anything_else", label: "Anything Else? (optional)", placeholder: "Share anything else you'd like us to know...", required: false },
];

const openQuestionsStep: FormStepDefinition = {
  id: "open_questions",
  title: "Open Questions",
  description: "Share your vision, motivation, and anything else we should know.",
  fields: openQuestionsFields,
};

// ---------------------------------------------------------------------------
// Full photography form definition
// ---------------------------------------------------------------------------

export const photographyFormDefinition: FormDefinition = {
  programSlug: "photography",
  steps: [
    personalStep,
    backgroundStep,
    healthStep,
    divingStep,
    equipmentStep,
    skillsStep,
    creativeProfileStep,
    goalsStep,
    logisticsStep,
    openQuestionsStep,
  ],
};

// Auto-register
registerForm(photographyFormDefinition);
