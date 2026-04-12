import type { FieldDefinition, FormStepDefinition, FormDefinition } from "./types";
import {
  firstNameField,
  lastNameField,
  nicknameField,
  emailField,
  phoneField,
  ageTextField,
  genderField,
} from "./common/personal";
import {
  nationalityField,
  countryOfResidenceField,
  languagesField,
  currentOccupationField,
} from "./common/background";
import { registerForm } from "./registry";
import {
  DIVING_TYPES,
  CERTIFICATION_LEVELS_SCUBA,
  NUMBER_OF_DIVES,
  INTERNSHIP_DIVING_ENVIRONMENTS,
  REFERRAL_SOURCES,
  HEALTH_CONDITIONS,
  FITNESS_LEVELS,
  INTERNSHIP_EDUCATION_LEVELS,
  INTERNSHIP_CONTENT_CREATED,
} from "./common/options";

// ---------------------------------------------------------------------------
// Internship application form — mirrors partner A's live Google Form.
// Significant differences from the other 3 programs:
//   - age is a short-answer text field (numeric), not a range select
//   - current_occupation is REQUIRED (optional on the other 3 forms)
//   - 3 field names differ from the old code: hoped_gains→internship_hopes,
//     azores_ties→accommodation_ties, why_good_candidate→candidacy_reason
//   - certification_level uses CERTIFICATION_LEVELS_SCUBA (shared with
//     filmmaking/photography); discrepancies handled via allowOther
//   - no btm_category / budget / time_availability / start_timeline /
//     travel_willingness / primary_goal / learning_aspects etc. (the
//     Google Form doesn't ask any of those for internship applicants)
// ---------------------------------------------------------------------------

const internshipPersonalStep: FormStepDefinition = {
  id: "personal",
  title: "About You",
  description:
    "Help us get to know you better. This information will be kept confidential and used only for BTM Academy purposes.",
  fields: [
    firstNameField,
    lastNameField,
    nicknameField,
    emailField,
    phoneField,
    ageTextField,
    genderField,
    nationalityField,
    countryOfResidenceField,
    languagesField,
    currentOccupationField(true),
    { type: "select", name: "education_level", label: "What is the highest level of education or training you have completed so far?", options: INTERNSHIP_EDUCATION_LEVELS, required: true, columns: 1, allowOther: true },
    { type: "text", name: "field_of_study", label: "What is your field of study, training or profession?", required: true, half: true },
    { type: "text", multiline: true, name: "recent_activities", label: "Which activities (like jobs, studies, school, time-intensive interests) have primarily occupied your time over the past few years?", required: true },
    { type: "text", name: "online_links", label: "If you have an online presence, please share your links.", placeholder: "Instagram, Youtube, website, etc.", required: false },
    { type: "text", multiline: true, name: "accommodation_ties", label: "Do you already have accommodation, connections, or other ties to Faial, Azores?", required: false },
  ],
};

const filmmakingExperienceFields: FieldDefinition[] = [
  { type: "text", multiline: true, name: "filmmaking_experience", label: "Experience with underwater filmmaking so far", required: true },
  { type: "text", multiline: true, name: "filming_equipment", label: "List your filming equipment", required: false },
  { type: "multiselect", name: "content_created", label: "What type of content have you created so far?", options: INTERNSHIP_CONTENT_CREATED, required: true, allowOther: true },
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
  { type: "text", multiline: true, name: "internship_hopes", label: "What do you hope to gain from this internship?", minLength: 10, required: true },
  { type: "text", multiline: true, name: "candidacy_reason", label: "Why do you think you are a good candidate for the internship?", minLength: 10, required: true },
];

const motivationStep: FormStepDefinition = {
  id: "motivation",
  title: "Motivation",
  description: "Tell us why you want to join the BTM internship program.",
  fields: motivationFields,
};

const healthDivingFields: FieldDefinition[] = [
  { type: "select", name: "physical_fitness", label: "Physical Fitness & Health", options: FITNESS_LEVELS, required: true, columns: 1, allowOther: true },
  { type: "select", name: "health_conditions", label: "Do you have any specific health conditions that might affect diving?", options: HEALTH_CONDITIONS, required: true, columns: 1 },
  { type: "text", multiline: true, name: "health_details", label: "Health Details (optional)", placeholder: "If you have any conditions, please provide details...", required: false, visibleWhen: { field: "health_conditions", operator: "neq", value: "No health conditions affecting diving" } },
  { type: "multiselect", name: "diving_types", label: "What type of diving do you practice?", options: DIVING_TYPES, required: true, allowOther: true },
  { type: "multiselect", name: "certification_level", label: "Current diving certification level", options: CERTIFICATION_LEVELS_SCUBA, required: true, allowOther: true },
  { type: "select", name: "number_of_dives", label: "Number of dives", options: NUMBER_OF_DIVES, required: true },
  { type: "date", name: "last_dive_date", label: "Last diving activity date", required: true },
  { type: "multiselect", name: "diving_environments", label: "Diving environments experience", options: INTERNSHIP_DIVING_ENVIRONMENTS, required: true, allowOther: true },
  { type: "rating", name: "buoyancy_skill", label: "How would you describe your buoyancy skill level (1 = still learning, 10 = excellent)" },
];

const healthDivingStep: FormStepDefinition = {
  id: "health_diving",
  title: "Health & Diving",
  description: "Tell us about your health and diving background.",
  fields: healthDivingFields,
};

const openQuestionsFields: FieldDefinition[] = [
  { type: "select", name: "referral_source", label: "How did you hear about BTM Academy?", options: REFERRAL_SOURCES, required: true, allowOther: true },
  { type: "text", multiline: true, name: "questions_or_concerns", label: "Do you have any specific questions or concerns?", placeholder: "Anything you'd like to ask or flag before submitting?", required: false },
  { type: "text", multiline: true, name: "anything_else", label: "Is there anything else you'd like to share with us?", placeholder: "Share anything else you'd like us to know...", required: false },
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
