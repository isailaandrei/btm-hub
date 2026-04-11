import type { FieldDefinition, FormStepDefinition, FormDefinition } from "./types";
import { personalStep } from "./common/personal";
import { registerForm } from "./registry";
import {
  FITNESS_LEVELS,
  HEALTH_CONDITIONS_FREEDIVING,
  FREEDIVING_CERTIFICATION_LEVELS,
  NUMBER_OF_SESSIONS,
  PRACTICE_DURATION,
  FREEDIVING_ENVIRONMENTS,
  PERFORMANCE_EXPERIENCE,
  LAND_MOVEMENT_SPORTS,
  CHOREOGRAPHY_EXPERIENCE,
  FILMED_UNDERWATER,
  BTM_CATEGORIES_FREEDIVING,
  ONLINE_PRESENCE,
  FREEDIVING_GOALS,
  FREEDIVING_LEARNING_ASPECTS,
  LEARNING_APPROACHES,
  PROFESSIONAL_MATERIAL_PURPOSE,
  TIME_AVAILABILITY,
  TRAVEL_WILLINGNESS,
  BUDGETS,
  START_TIMELINES,
  REFERRAL_SOURCES,
} from "./common/options";

// ---------------------------------------------------------------------------
// Freediving & Modelling application form — mirrors partner A's live Google
// Form. Unique to freediving: the health question uses "freediving" phrasing
// (HEALTH_CONDITIONS_FREEDIVING) rather than the shared "diving" wording.
// ---------------------------------------------------------------------------

const healthFields: FieldDefinition[] = [
  { type: "select", name: "physical_fitness", label: "Physical Fitness & Health", options: FITNESS_LEVELS, required: true, columns: 1 },
  { type: "select", name: "health_conditions", label: "Do you have any specific health conditions that might affect freediving?", options: HEALTH_CONDITIONS_FREEDIVING, required: true, columns: 1 },
  {
    type: "text",
    multiline: true,
    name: "health_details",
    label: "Health Details (optional)",
    placeholder: "If you have any conditions, please provide details...",
    required: false,
    visibleWhen: { field: "health_conditions", operator: "neq", value: "No health conditions affecting freediving" },
  },
];

const healthStep: FormStepDefinition = {
  id: "health",
  title: "Health & Fitness",
  description: "Physical fitness and good health are important for safe freediving. Please select the statement that best describes your current condition:",
  fields: healthFields,
};

const freedivingExperienceFields: FieldDefinition[] = [
  { type: "multiselect", name: "certification_level", label: "Current freediving certification level", options: FREEDIVING_CERTIFICATION_LEVELS, required: true, allowOther: true },
  { type: "select", name: "number_of_sessions", label: "Number of freediving sessions", options: NUMBER_OF_SESSIONS, required: true },
  { type: "select", name: "practice_duration", label: "How long have you been practicing freediving or breath-hold activities?", options: PRACTICE_DURATION, required: true, columns: 1 },
  { type: "date", name: "last_session_date", label: "Last freediving session", required: true },
  { type: "text", name: "comfortable_max_depth", label: "What is your current comfortable maximum depth?", required: true },
  { type: "text", name: "breath_hold_time", label: "What is your current comfortable breath-hold time? Static or dynamic, please specify", required: true },
  { type: "text", name: "personal_best", label: "What is your personal best?", required: false },
  { type: "multiselect", name: "diving_environments", label: "Diving environments experience", options: FREEDIVING_ENVIRONMENTS, required: true },
];

const freedivingExperienceStep: FormStepDefinition = {
  id: "freediving_experience",
  title: "Freediving Experience",
  description: "Tell us about your freediving background and comfort level.",
  fields: freedivingExperienceFields,
};

const underwaterPerformanceFields: FieldDefinition[] = [
  { type: "select", name: "performance_experience", label: "Years of experience in expressive underwater performance", options: PERFORMANCE_EXPERIENCE, required: true },
  { type: "select", name: "land_movement_sports", label: "What forms of movement/sports do you practice on land?", options: LAND_MOVEMENT_SPORTS, required: true, allowOther: true },
  { type: "select", name: "choreography_experience", label: "Have you ever worked with choreography or improvised movements?", options: CHOREOGRAPHY_EXPERIENCE, required: true },
  { type: "select", name: "filmed_underwater", label: "Have you ever been filmed while moving underwater?", options: FILMED_UNDERWATER, required: true },
  { type: "rating", name: "comfort_without_dive_line", label: "How comfortable are you moving underwater without a dive line? (1–10)" },
  { type: "rating", name: "comfort_without_fins", label: "How comfortable are you moving freely underwater without fins? (1–10)" },
  { type: "rating", name: "comfort_without_mask", label: "How comfortable are you moving freely underwater without mask? (1–10)" },
];

const underwaterPerformanceStep: FormStepDefinition = {
  id: "underwater_performance",
  title: "Underwater Performance",
  description: "Tell us about your movement experience and comfort underwater.",
  fields: underwaterPerformanceFields,
};

const equipmentFields: FieldDefinition[] = [
  { type: "text", multiline: true, name: "freediving_equipment", label: "List your freediving equipment", placeholder: "Fins, mask, wetsuit, weights...", required: true },
];

const equipmentStep: FormStepDefinition = {
  id: "equipment",
  title: "Equipment",
  description: "What gear do you currently own?",
  fields: equipmentFields,
};

const creativeProfileFields: FieldDefinition[] = [
  { type: "select", name: "btm_category", label: "Which BTM Academy category best describes you?", options: BTM_CATEGORIES_FREEDIVING, required: true, columns: 1 },
  { type: "multiselect", name: "online_presence", label: "Online presence", options: ONLINE_PRESENCE, required: true },
  { type: "text", name: "online_links", label: "If you have an online presence, please share your links.", placeholder: "Instagram, website, portfolio...", required: false },
];

const creativeProfileStep: FormStepDefinition = {
  id: "creative_profile",
  title: "Professional Status",
  description: "Help us understand your creative journey and online presence.",
  fields: creativeProfileFields,
};

const goalsFields: FieldDefinition[] = [
  { type: "select", name: "primary_goal", label: "What is your primary goal with BTM Academy?", options: FREEDIVING_GOALS, required: true, columns: 1 },
  { type: "select", name: "secondary_goal", label: "What is your secondary goal with BTM Academy?", options: FREEDIVING_GOALS, required: true, columns: 1 },
  { type: "multiselect", name: "learning_aspects", label: "What aspects are you most interested in learning?", options: FREEDIVING_LEARNING_ASPECTS, required: true },
  { type: "multiselect", name: "learning_approach", label: "Preferred learning approach", options: LEARNING_APPROACHES, required: true },
  { type: "select", name: "professional_material_purpose", label: "Would you like to receive professional video and photo material of yourself performing underwater? If yes, for what purpose?", options: PROFESSIONAL_MATERIAL_PURPOSE, required: true },
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
  { type: "text", multiline: true, name: "ultimate_vision", label: "Please describe your ultimate vision for your freediving and modeling journey.", minLength: 10, required: true },
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
// Full freediving & modelling form definition
// ---------------------------------------------------------------------------

const freedivingModellingFormDefinition: FormDefinition = {
  programSlug: "freediving",
  steps: [
    personalStep,
    healthStep,
    freedivingExperienceStep,
    underwaterPerformanceStep,
    equipmentStep,
    creativeProfileStep,
    goalsStep,
    logisticsStep,
    openQuestionsStep,
  ],
};

registerForm(freedivingModellingFormDefinition);
