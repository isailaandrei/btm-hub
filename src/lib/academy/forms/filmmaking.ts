import type { FieldDefinition, FormStepDefinition, FormDefinition } from "./types";
import { personalStep } from "./common/personal";
import { healthStep } from "./common/health";
import { registerForm } from "./registry";
import {
  DIVING_TYPES,
  CERTIFICATION_LEVELS_SCUBA,
  NUMBER_OF_DIVES,
  DIVING_ENVIRONMENTS_SCUBA,
  BTM_CATEGORIES_MEDIA,
  PLANNING_TO_INVEST,
  YEARS_EXPERIENCE,
  INVOLVEMENT_LEVELS,
  TIME_AVAILABILITY,
  TRAVEL_WILLINGNESS,
  BUDGETS,
  START_TIMELINES,
  REFERRAL_SOURCES,
  ONLINE_PRESENCE,
  LEARNING_APPROACHES,
  MEDIA_INCOME,
  FILMMAKING_EQUIPMENT,
  FILMMAKING_CONTENT_CREATED,
  FILMMAKING_GOALS,
  FILMMAKING_LEARNING_ASPECTS,
  FILMMAKING_CONTENT_TO_CREATE,
  MARINE_SUBJECTS_MEDIA,
} from "./common/options";

// ---------------------------------------------------------------------------
// Filmmaking application form — mirrors partner A's live Google Form.
// ---------------------------------------------------------------------------

const divingFields: FieldDefinition[] = [
  { type: "multiselect", name: "diving_types", label: "What type of diving do you practice?", options: DIVING_TYPES, required: true, allowOther: true },
  { type: "multiselect", name: "certification_level", label: "Current diving certification level", options: CERTIFICATION_LEVELS_SCUBA, required: true, allowOther: true },
  { type: "text", name: "certification_details", label: "Certification Details (optional)", placeholder: "Agency, cert number, etc.", required: false, visibleWhen: { field: "certification_level", operator: "neq", value: "No certification yet" } },
  { type: "select", name: "number_of_dives", label: "Number of dives", options: NUMBER_OF_DIVES, required: true },
  { type: "date", name: "last_dive_date", label: "Last diving activity date", required: true },
  { type: "multiselect", name: "diving_environments", label: "Diving environments experience", options: DIVING_ENVIRONMENTS_SCUBA, required: true, allowOther: true },
  { type: "rating", name: "buoyancy_skill", label: "How would you describe your buoyancy skill level (1 = still learning, 10 = excellent)" },
];

const divingStep: FormStepDefinition = {
  id: "diving",
  title: "Diving Experience",
  description: "Tell us about your diving background and comfort level.",
  fields: divingFields,
};

const equipmentFields: FieldDefinition[] = [
  { type: "multiselect", name: "equipment_owned", label: "Current equipment owned", options: FILMMAKING_EQUIPMENT, required: false, allowOther: true },
  { type: "text", multiline: true, name: "filming_equipment", label: "List your underwater filming equipment", placeholder: "Camera body, housing, lights, gimbal, editing software...", required: true },
  { type: "select", name: "planning_to_invest", label: "Planning to invest in new equipment?", options: PLANNING_TO_INVEST, required: true },
];

const equipmentStep: FormStepDefinition = {
  id: "equipment",
  title: "Equipment",
  description: "What gear do you currently own or plan to acquire?",
  fields: equipmentFields,
};

const skillsFields: FieldDefinition[] = [
  { type: "select", name: "years_experience", label: "Years of experience in underwater filming", options: YEARS_EXPERIENCE, required: true },
  { type: "rating", name: "skill_camera_settings", label: "Camera settings and operation" },
  { type: "rating", name: "skill_lighting", label: "Underwater lighting" },
  { type: "rating", name: "skill_post_production", label: "Post-production editing" },
  { type: "rating", name: "skill_color_correction", label: "Color correction" },
  { type: "rating", name: "skill_storytelling", label: "Storytelling" },
  { type: "rating", name: "skill_drone", label: "Drone filming" },
  { type: "rating", name: "skill_over_water", label: "Over-water filming" },
];

const skillsStep: FormStepDefinition = {
  id: "skills",
  title: "Filming Skills",
  description: "Rate your current skill levels honestly — there are no wrong answers.",
  fields: skillsFields,
};

const professionalStatusFields: FieldDefinition[] = [
  { type: "select", name: "btm_category", label: "Which BTM Academy category best describes you?", options: BTM_CATEGORIES_MEDIA, required: true, columns: 1 },
  { type: "multiselect", name: "content_created", label: "What type of underwater content have you created so far?", options: FILMMAKING_CONTENT_CREATED, required: true, allowOther: true },
  { type: "select", name: "involvement_level", label: "Current involvement in underwater filming", options: INVOLVEMENT_LEVELS, required: true, allowOther: true },
  { type: "multiselect", name: "online_presence", label: "Online presence", options: ONLINE_PRESENCE, required: true },
  { type: "text", name: "online_links", label: "If you have an online presence, please share your links.", placeholder: "Instagram, website, portfolio...", required: false },
  { type: "select", name: "income_from_filming", label: "Do you currently earn income from underwater filming?", options: MEDIA_INCOME, required: true },
];

const professionalStatus: FormStepDefinition = {
  id: "creative_profile",
  title: "Professional Status",
  description: "Let us understand where you are in your underwater filming journey, whether it's a hobby, a developing career, or a conservation passion",
  fields: professionalStatusFields,
};

const goalsFields: FieldDefinition[] = [
  { type: "select", name: "primary_goal", label: "What is your primary goal with BTM Academy?", options: FILMMAKING_GOALS, required: true },
  { type: "select", name: "secondary_goal", label: "What is your secondary goal with BTM Academy?", options: FILMMAKING_GOALS, required: true },
  { type: "multiselect", name: "learning_aspects", label: "What aspects are you most interested in learning?", options: FILMMAKING_LEARNING_ASPECTS, required: true },
  { type: "multiselect", name: "content_to_create", label: "What type of content would you like to create?", options: FILMMAKING_CONTENT_TO_CREATE, required: true },
  { type: "multiselect", name: "learning_approach", label: "Preferred learning approach", options: LEARNING_APPROACHES, required: true },
  { type: "multiselect", name: "marine_subjects", label: "What marine subjects interest you most?", options: MARINE_SUBJECTS_MEDIA, required: true },
];

const goalsStep: FormStepDefinition = {
  id: "goals",
  title: "Goals & Learning",
  description: "What do you want to achieve through the program?",
  fields: goalsFields,
};

const logisticsFields: FieldDefinition[] = [
  { type: "select", name: "time_availability", label: "Time availability for BTM Academy training and projects", options: TIME_AVAILABILITY, required: true, columns: 1 },
  { type: "select", name: "travel_willingness", label: "Travel willingness", options: TRAVEL_WILLINGNESS, required: true },
  { type: "select", name: "budget", label: "Career investment plans", options: BUDGETS, required: true, columns: 1 },
  { type: "select", name: "start_timeline", label: "Preferred start timeline", options: START_TIMELINES, required: true },
];

const logisticsStep: FormStepDefinition = {
  id: "logistics",
  title: "Logistics",
  description: "Practical details about your availability and commitment.",
  fields: logisticsFields,
};

const openQuestionsFields: FieldDefinition[] = [
  { type: "text", multiline: true, name: "ultimate_vision", label: "Please describe your ultimate vision for your underwater filming journey", minLength: 10, required: true },
  { type: "text", multiline: true, name: "inspiration_to_apply", label: "What inspired you to apply to BTM Academy?", minLength: 10, required: true },
  { type: "multiselect", name: "referral_source", label: "How did you hear about BTM Academy?", options: REFERRAL_SOURCES, required: true, allowOther: true },
  { type: "text", multiline: true, name: "questions_or_concerns", label: "Do you have any specific questions or concerns?", placeholder: "Anything you'd like to ask or flag before submitting?", required: false },
  { type: "text", multiline: true, name: "anything_else", label: "Is there anything else you'd like to share with us?", placeholder: "Share anything else you'd like us to know...", required: false },
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
    healthStep,
    divingStep,
    equipmentStep,
    skillsStep,
    professionalStatus,
    goalsStep,
    logisticsStep,
    openQuestionsStep,
  ],
};

// Auto-register
registerForm(filmmakingFormDefinition);
