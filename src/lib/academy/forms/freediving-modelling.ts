import type { FieldDefinition, FormStepDefinition, FormDefinition } from "./types";
import { personalStep } from "./common/personal";
import { backgroundStep } from "./common/background";
import { healthStep } from "./common/health";
import { registerForm } from "./registry";
import {
  TIME_AVAILABILITY,
  TRAVEL_WILLINGNESS,
  BUDGETS,
  START_TIMELINES,
  REFERRAL_SOURCES,
} from "./common/options";

// ---------------------------------------------------------------------------
// Freediving & Modelling–specific option lists
// ---------------------------------------------------------------------------

const FREEDIVING_CERTIFICATION_LEVELS = [
  "None",
  "AIDA 2 or equivalent",
  "AIDA 3 or equivalent",
  "AIDA 4 or equivalent",
  "Freediving Instructor",
  "SSI level 2",
] as const;

const NUMBER_OF_SESSIONS = [
  "0-10",
  "11-50",
  "51-250",
  "250+",
] as const;

const PRACTICE_DURATION = [
  "Less than 6 months",
  "6 months - 1 year",
  "1-2 years",
  "> 2 years",
] as const;

const FREEDIVING_ENVIRONMENTS = [
  "Tropical Reefs",
  "Open water",
  "Pool",
  "Deep pool",
  "Deep diving",
  "Night diving",
] as const;

const PERFORMANCE_EXPERIENCE = [
  "None",
  "Less than 1 year",
  "1-3 years",
  "3-5 years",
  "5+ years",
] as const;

const CHOREOGRAPHY_EXPERIENCE = [
  "No",
  "Yes, little experience",
  "Yes, extended experience",
] as const;

const FILMED_UNDERWATER = [
  "No",
  "Yes, little experience",
  "Yes, extended experience",
] as const;

const FREEDIVING_BTM_CATEGORIES = [
  "Beginner",
  "Developing artist (starting to build a creative identity)",
  "Independent creator (experienced hobbyist/influencer seeking improvement)",
  "Professional (working in the field, seeking refinement or mentorship)",
] as const;

const ONLINE_PRESENCE = [
  "None",
  "Active social media",
  "Professional portfolio",
  "Personal website",
  "Multiple platforms",
] as const;

const LEARNING_ASPECTS = [
  "Body awareness",
  "Soul-body connection",
  "Marine life behavior understanding",
  "Sensitive marine wildlife interactions",
  "Techniques for expressive underwater movement",
  "Creating individual movement sequences and choreography",
  "Creative self-expression",
  "Business aspects of underwater performance",
] as const;

const LEARNING_APPROACHES = [
  "One-on-one mentorship",
  "Group workshops",
  "Small group workshop",
  "Mixed approach (combination of group and individual)",
  "Project-based learning",
  "Self-paced with guidance",
] as const;

// ---------------------------------------------------------------------------
// Freediving & Modelling–specific steps
// ---------------------------------------------------------------------------

const freedivingExperienceFields: FieldDefinition[] = [
  { type: "select", name: "certification_level", label: "Freediving Certification Level", options: FREEDIVING_CERTIFICATION_LEVELS, required: true },
  { type: "select", name: "number_of_sessions", label: "Number of Freediving Sessions", options: NUMBER_OF_SESSIONS, required: true },
  { type: "select", name: "practice_duration", label: "How Long Have You Been Practicing?", options: PRACTICE_DURATION, required: true },
  { type: "date", name: "last_session_date", label: "Last Freediving Session", required: true },
  { type: "text", name: "comfortable_max_depth", label: "What is your current comfortable maximum depth?", required: true },
  { type: "text", name: "breath_hold_time", label: "What is your current comfortable breath-hold time? Static or dynamic, please specify", required: true },
  { type: "text", name: "personal_best", label: "What is your personal best?", required: true },
  { type: "multiselect", name: "diving_environments", label: "Diving Environments Experience", options: FREEDIVING_ENVIRONMENTS, required: true },
];

const freedivingExperienceStep: FormStepDefinition = {
  id: "freediving_experience",
  title: "Freediving Experience",
  description: "Tell us about your freediving background and comfort level.",
  fields: freedivingExperienceFields,
};

const underwaterPerformanceFields: FieldDefinition[] = [
  { type: "select", name: "performance_experience", label: "Years of Experience in Expressive Underwater Performance", options: PERFORMANCE_EXPERIENCE, required: true },
  { type: "text", name: "land_movement_sports", label: "What forms of movement/sports do you practice on land?", required: true },
  { type: "select", name: "choreography_experience", label: "Have you ever worked with choreography or improvised movements?", options: CHOREOGRAPHY_EXPERIENCE, required: true },
  { type: "select", name: "filmed_underwater", label: "Have you ever been filmed while moving underwater?", options: FILMED_UNDERWATER, required: true },
  { type: "rating", name: "comfort_without_dive_line", label: "Comfort moving underwater without a dive line (1–10)" },
  { type: "rating", name: "comfort_without_fins", label: "Comfort moving freely underwater without fins (1–10)" },
  { type: "rating", name: "comfort_without_mask", label: "Comfort moving freely underwater without mask (1–10)" },
];

const underwaterPerformanceStep: FormStepDefinition = {
  id: "underwater_performance",
  title: "Underwater Performance",
  description: "Tell us about your movement experience and comfort underwater.",
  fields: underwaterPerformanceFields,
};

const equipmentFields: FieldDefinition[] = [
  { type: "text", multiline: true, name: "freediving_equipment", label: "List Your Freediving Equipment", placeholder: "Fins, mask, wetsuit, weights...", required: true },
];

const equipmentStep: FormStepDefinition = {
  id: "equipment",
  title: "Equipment",
  description: "What gear do you currently own?",
  fields: equipmentFields,
};

const creativeProfileFields: FieldDefinition[] = [
  { type: "select", name: "btm_category", label: "Which BTM Academy category best describes you?", options: FREEDIVING_BTM_CATEGORIES, required: true },
  { type: "select", name: "online_presence", label: "Online Presence", options: ONLINE_PRESENCE, required: true },
  { type: "text", name: "online_links", label: "If you have an online presence, please share your links.", placeholder: "Instagram, website, portfolio...", required: false },
];

const creativeProfileStep: FormStepDefinition = {
  id: "creative_profile",
  title: "Creative Profile",
  description: "Help us understand your creative journey and online presence.",
  fields: creativeProfileFields,
};

const goalsFields: FieldDefinition[] = [
  { type: "text", name: "primary_goal", label: "What is your primary goal with BTM Academy?", required: true },
  { type: "text", name: "secondary_goal", label: "What is your secondary goal with BTM Academy? (optional)", required: false },
  { type: "multiselect", name: "learning_aspects", label: "What aspects are you most interested in learning?", options: LEARNING_ASPECTS, required: true },
  { type: "select", name: "learning_approach", label: "Preferred Learning Approach", options: LEARNING_APPROACHES, required: true },
  { type: "text", multiline: true, name: "professional_material_purpose", label: "Would you like to receive professional video and photo material of yourself performing underwater? If yes, for what purpose?", required: false },
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
  { type: "select", name: "start_timeline", label: "Preferred Start Timeline", options: START_TIMELINES, required: true },
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
  { type: "multiselect", name: "referral_source", label: "How Did You Hear About BTM Academy?", options: REFERRAL_SOURCES, required: true },
  { type: "text", multiline: true, name: "questions_or_concerns", label: "Do you have any specific questions or concerns? (optional)", placeholder: "Anything you'd like to ask or flag before submitting?", required: false },
  { type: "text", multiline: true, name: "anything_else", label: "Is there anything else you'd like to share with us? (optional)", placeholder: "Share anything else you'd like us to know...", required: false },
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
    backgroundStep,
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
