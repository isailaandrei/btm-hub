import type { FieldDefinition, FormStepDefinition, FormDefinition } from "./types";
import { personalFields } from "./common/personal";
import { backgroundFields } from "./common/background";
import { registerForm } from "./registry";
import {
  DIVING_TYPES,
  CERTIFICATION_LEVELS,
  NUMBER_OF_DIVES,
  DIVING_ENVIRONMENTS,
  REFERRAL_SOURCES,
  HEALTH_CONDITIONS,
  FITNESS_LEVELS
} from "./common/options";

// ---------------------------------------------------------------------------
// Internship-specific option lists
// ---------------------------------------------------------------------------

const EDUCATION_LEVELS = [
  "High school",
  "Vocational training",
  "Bachelor's degree",
  "Master's degree",
  "PhD",
  "Other",
] as const;

const CONTENT_CREATED = [
  "Underwater photography",
  "Underwater videography",
  "Topside photography",
  "Topside videography",
  "Drone footage",
  "Social media content",
  "Documentary",
  "Commercial",
] as const;

// ---------------------------------------------------------------------------
// Internship-specific steps
// ---------------------------------------------------------------------------

const internshipPersonalStep: FormStepDefinition = {
  id: "personal",
  title: "About You",
  description: "Help us get to know you better. This information will be kept confidential and used only for BTM Academy purposes.",
  fields: [
    ...personalFields,
    ...backgroundFields,
    { type: "select", name: "education_level", label: "Highest Level of Education or Training", options: EDUCATION_LEVELS, required: true },
    { type: "text", name: "field_of_study", label: "What is your field of study, training or profession?", required: true, half: true },
    { type: "text", multiline: true, name: "recent_activities", label: "Which activities (like jobs, studies, school, time-intensive interests) have primarily occupied your time over the past few years?", required: true },
    { type: "text", name: "online_links", label: "If you have an online presence, please share your links.", placeholder: "Instagram, website, portfolio...", required: false },
    { type: "text", multiline: true, name: "azores_ties", label: "Do you already have accommodation, connections, or other ties to Faial, Azores?", required: false },
  ],
};

const filmmakingExperienceFields: FieldDefinition[] = [
  { type: "text", multiline: true, name: "filmmaking_experience", label: "Experience with underwater filmmaking so far", required: true },
  { type: "text", multiline: true, name: "filming_equipment", label: "List your filming equipment", required: true },
  { type: "multiselect", name: "content_created", label: "What type of content have you created so far?", options: CONTENT_CREATED, required: true },
];

const filmmakingExperienceStep: FormStepDefinition = {
  id: "filmmaking_experience",
  title: "Filmmaking Experience",
  description: "Tell us about your experience with underwater filmmaking.",
  fields: filmmakingExperienceFields,
};

const motivationFields: FieldDefinition[] = [
  { type: "text", multiline: true, name: "inspiration_to_apply", label: "What inspired you to apply to BTM Academy?", minLength: 10, required: true },
  { type: "text", multiline: true, name: "ultimate_vision", label: "Please describe your ultimate vision for your underwater filming journey", minLength: 10, required: true },
  { type: "text", multiline: true, name: "hoped_gains", label: "What do you hope to gain from this internship?", minLength: 10, required: true },
  { type: "text", multiline: true, name: "why_good_candidate", label: "Why do you think you are a good candidate for the internship?", minLength: 10, required: true },
];

const motivationStep: FormStepDefinition = {
  id: "motivation",
  title: "Motivation",
  description: "Tell us why you want to join the BTM internship program.",
  fields: motivationFields,
};

const healthDivingFields: FieldDefinition[] = [
  { type: "select", name: "physical_fitness", label: "Physical Fitness Level", options: FITNESS_LEVELS, required: true, columns: 1 },
  { type: "select", name: "health_conditions", label: "Health Conditions", options: HEALTH_CONDITIONS, required: true },
  { type: "text", multiline: true, name: "health_details", label: "Health Details (optional)", placeholder: "If you have any conditions, please provide details...", required: false, visibleWhen: { field: "health_conditions", operator: "neq", value: "None" } },
  { type: "multiselect", name: "diving_types", label: "Types of Diving", options: DIVING_TYPES, required: true },
  { type: "select", name: "certification_level", label: "Certification Level", options: CERTIFICATION_LEVELS, required: true },
  { type: "select", name: "number_of_dives", label: "Number of Dives", options: NUMBER_OF_DIVES, required: true },
  { type: "date", name: "last_dive_date", label: "Last Dive Date", required: true },
  { type: "multiselect", name: "diving_environments", label: "Diving Environments", options: DIVING_ENVIRONMENTS, required: true },
  { type: "rating", name: "buoyancy_skill", label: "Buoyancy Skill (1 = beginner, 10 = expert)" },
];

const healthDivingStep: FormStepDefinition = {
  id: "health_diving",
  title: "Health & Diving",
  description: "Tell us about your health and diving background.",
  fields: healthDivingFields,
};

const openQuestionsFields: FieldDefinition[] = [
  { type: "multiselect", name: "referral_source", label: "How Did You Hear About BTM Academy?", options: REFERRAL_SOURCES, required: true },
  { type: "text", multiline: true, name: "questions_or_concerns", label: "Do you have any specific questions or concerns? (optional)", placeholder: "Anything you'd like to ask or flag before submitting?", required: false },
  { type: "text", multiline: true, name: "anything_else", label: "Is there anything else you'd like to share with us? (optional)", placeholder: "Share anything else you'd like us to know...", required: false },
];

const openQuestionsStep: FormStepDefinition = {
  id: "open_questions",
  title: "Open Questions",
  description: "Final questions before you submit your application.",
  fields: openQuestionsFields,
};

// ---------------------------------------------------------------------------
// Full internship form definition
// ---------------------------------------------------------------------------

export const internshipFormDefinition: FormDefinition = {
  programSlug: "internship",
  steps: [
    internshipPersonalStep,
    filmmakingExperienceStep,
    motivationStep,
    healthDivingStep,
    openQuestionsStep,
  ],
};

// Auto-register
registerForm(internshipFormDefinition);
