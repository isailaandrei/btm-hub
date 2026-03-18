import type { FieldDefinition, FormStepDefinition, FormDefinition } from "./types";
import { personalStep } from "./common/personal";
import { backgroundStep } from "./common/background";
import { healthStep } from "./common/health";
import { registerForm } from "./registry";
import {
  DIVING_TYPES,
  CERTIFICATION_LEVELS,
  NUMBER_OF_DIVES,
  DIVING_ENVIRONMENTS,
  BTM_CATEGORIES,
  TIME_AVAILABILITY,
  TRAVEL_WILLINGNESS,
  BUDGETS,
  START_TIMELINES,
  REFERRAL_SOURCES,
} from "./common/options";

// ---------------------------------------------------------------------------
// Filmmaking-specific option lists
// ---------------------------------------------------------------------------

const FILMMAKING_EQUIPMENT_OWNED = [
  "Camera",
  "Underwater housing",
  "Video lights",
  "Wide-angle lens",
  "Macro lens",
  "Drone",
  "Gimbal / stabilizer",
  "Editing software",
] as const;

const PLANNING_TO_INVEST = [
  "Yes, significant investment planned",
  "Yes, moderate investment planned",
  "Small investment planned",
  "No investment planned at this time",
] as const;

const YEARS_EXPERIENCE = [
  "Less than 1 year",
  "1-2 years",
  "3-5 years",
  "5-10 years",
  "10+ years",
] as const;

const CONTENT_CREATED = [
  "Personal vacation videos",
  "Social media content",
  "Documentary style",
  "Commercial work",
  "Scientific / research documentation",
  "Conservation stories",
  "None yet",
] as const;

const INVOLVEMENT_LEVELS = [
  "Hobby",
  "Part-time",
  "Full-time",
  "Transitioning to full-time",
] as const;

const ONLINE_PRESENCE = [
  "None",
  "Personal social media only",
  "Dedicated filming social media",
  "Website / portfolio",
  "Multiple platforms",
] as const;

const INCOME_FROM_FILMING = [
  "None",
  "Occasional / side income",
  "Part of my income",
  "Primary income source",
] as const;

const PRIMARY_GOALS = [
  "Learn underwater filming from scratch",
  "Improve existing skills",
  "Transition to professional",
  "Build a portfolio",
  "Content creation",
  "Conservation / scientific documentation",
] as const;

const LEARNING_ASPECTS = [
  "Basic equipment setup & operation",
  "Camera settings & techniques",
  "Lighting techniques",
  "Marine life behavior understanding",
  "Storytelling & content planning",
  "Post-production & editing",
  "Business aspects of underwater filming",
  "Client relations & project management",
  "Conservation documentation",
] as const;

const CONTENT_TO_CREATE = [
  "Personal / travel memories",
  "Social media content",
  "Documentary style films",
  "Commercial / advertising content",
  "Scientific / research documentation",
  "Conservation stories",
] as const;

const LEARNING_APPROACHES = [
  "One-on-one mentorship",
  "Group workshops",
  "Small group workshop",
  "Mixed approach (combination of group and individual)",
  "Project-based learning",
] as const;

const MARINE_SUBJECTS = [
  "Coral reefs",
  "Big marine life (sharks, whales, etc.)",
  "Macro subjects",
  "Marine behavior",
  "Conservation stories",
] as const;

// ---------------------------------------------------------------------------
// Filmmaking-specific steps
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
  { type: "multiselect", name: "equipment_owned", label: "Equipment Owned", options: FILMMAKING_EQUIPMENT_OWNED, required: false },
  { type: "text", multiline: true, name: "filming_equipment", label: "List Your Underwater Filming Equipment", placeholder: "Camera body, housing, lights, gimbal, editing software...", required: true },
  { type: "select", name: "planning_to_invest", label: "Planning to Invest in New Equipment?", options: PLANNING_TO_INVEST, required: true },
];

const equipmentStep: FormStepDefinition = {
  id: "equipment",
  title: "Equipment",
  description: "What gear do you currently own or plan to acquire?",
  fields: equipmentFields,
};

const skillsFields: FieldDefinition[] = [
  { type: "select", name: "years_experience", label: "Years of Filming Experience", options: YEARS_EXPERIENCE, required: true },
  { type: "rating", name: "skill_camera_settings", label: "Camera Settings & Operation" },
  { type: "rating", name: "skill_lighting", label: "Underwater Lighting" },
  { type: "rating", name: "skill_post_production", label: "Post-Production Editing" },
  { type: "rating", name: "skill_color_correction", label: "Color Correction" },
  { type: "rating", name: "skill_storytelling", label: "Storytelling" },
  { type: "rating", name: "skill_drone", label: "Drone Filming" },
  { type: "rating", name: "skill_over_water", label: "Over-Water Filming" },
];

const skillsStep: FormStepDefinition = {
  id: "skills",
  title: "Filming Skills",
  description: "Rate your current skill levels honestly — there are no wrong answers.",
  fields: skillsFields,
};

const creativeProfileFields: FieldDefinition[] = [
  { type: "multiselect", name: "content_created", label: "Content You've Created", options: CONTENT_CREATED, required: true },
  { type: "select", name: "btm_category", label: "How Would You Categorize Yourself?", options: BTM_CATEGORIES, required: true },
  { type: "select", name: "involvement_level", label: "Level of Involvement in Underwater Filming", options: INVOLVEMENT_LEVELS, required: true },
  { type: "select", name: "online_presence", label: "Online Presence", options: ONLINE_PRESENCE, required: true },
  { type: "text", name: "online_links", label: "Links to Your Work (optional)", placeholder: "Instagram, website, portfolio...", required: false },
  { type: "select", name: "income_from_filming", label: "Income from Underwater Filming", options: INCOME_FROM_FILMING, required: true },
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
  { type: "select", name: "budget", label: "Career Investment Plans", options: BUDGETS, required: true },
  { type: "select", name: "start_timeline", label: "When Can You Start?", options: START_TIMELINES, required: true },
];

const logisticsStep: FormStepDefinition = {
  id: "logistics",
  title: "Logistics",
  description: "Practical details about your availability and commitment.",
  fields: logisticsFields,
};

const openQuestionsFields: FieldDefinition[] = [
  { type: "text", multiline: true, name: "ultimate_vision", label: "What is your ultimate vision for your underwater filming journey?", minLength: 10, required: true },
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
// Full filmmaking form definition
// ---------------------------------------------------------------------------

export const filmmakingFormDefinition: FormDefinition = {
  programSlug: "filmmaking",
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
registerForm(filmmakingFormDefinition);
