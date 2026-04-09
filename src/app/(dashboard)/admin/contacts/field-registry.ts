import type { ProgramSlug } from "@/types/database";

export interface FieldRegistryEntry {
  key: string;
  label: string;
  type: "select" | "multiselect" | "rating";
  options: string[];
  programs: ProgramSlug[];
  curated: boolean;
}

const RATING_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

export const FIELD_REGISTRY: FieldRegistryEntry[] = [
  // ---- Curated (shown upfront in column picker) ----
  {
    key: "budget",
    label: "Budget",
    type: "select",
    options: ["Under $1,000", "$1,000 - $3,000", "$3,000 - $5,000", "$5,000 - $10,000", "$10,000+"],
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "time_availability",
    label: "Time Availability",
    type: "select",
    options: ["1-2 weeks", "2-4 weeks", "1-3 months", "3-6 months", "6+ months", "Flexible"],
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "start_timeline",
    label: "Start Timeline",
    type: "select",
    options: ["Immediately", "Within 1 month", "Within 3 months", "Within 6 months", "Within a year", "Not sure yet"],
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "btm_category",
    label: "BTM Category",
    type: "select",
    options: [
      "BEGINNER - Creative Explorer (Just starting, hobby-focused, seeking basic skills)",
      "INDEPENDENT CREATOR (Experienced hobbyist/influencer seeking improvement)",
      "ASPIRING PROFESSIONAL (Part-time professional aiming for full-time career)",
      "DEDICATED ACHIEVER (Business-focused, seeking intensive mentorship)",
      "OCEAN STEWARD (NGO/scientific focus, conservation-driven)",
      "Beginner",
      "Developing artist (starting to build a creative identity)",
      "Independent creator (experienced hobbyist/influencer seeking improvement)",
      "Professional (working in the field, seeking refinement or mentorship)",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "certification_level",
    label: "Certification Level",
    type: "select",
    options: [
      "None", "Open Water (OW)", "Advanced Open Water (AOW)", "Rescue Diver", "Divemaster", "Instructor",
      "AIDA 2 or equivalent", "AIDA 3 or equivalent", "AIDA 4 or equivalent", "Freediving Instructor", "SSI level 2",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },
  {
    key: "years_experience",
    label: "Years of Experience",
    type: "select",
    options: ["None", "Less than 1 year", "1-2 years", "3-5 years", "5+"],
    programs: ["filmmaking", "photography"],
    curated: true,
  },
  {
    key: "involvement_level",
    label: "Involvement Level",
    type: "select",
    options: ["Complete beginner", "Hobby", "Part-time", "Full-time", "Conservation/Scientific work"],
    programs: ["filmmaking", "photography"],
    curated: true,
  },
  {
    key: "travel_willingness",
    label: "Travel Willingness",
    type: "select",
    options: ["Yes, anywhere", "Yes, within my region", "Limited travel", "Prefer remote / online only"],
    programs: ["filmmaking", "photography", "freediving"],
    curated: true,
  },

  // ---- Personal & Health (all programs) ----
  {
    key: "age",
    label: "Age Range",
    type: "select",
    options: ["Under 18", "18-24", "25-34", "35-44", "45-54", "55+"],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "gender",
    label: "Gender",
    type: "select",
    options: ["Male", "Female", "Non-binary", "Prefer not to say"],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "physical_fitness",
    label: "Physical Fitness",
    type: "select",
    options: [
      "Excellent - Regular exercise, no health concerns",
      "Good - Moderately active, no major health concerns",
      "Average - Some physical activity, manageable health conditions",
      "Need improvement - Limited physical activity or health concerns",
      "Prefer to discuss privately",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "health_conditions",
    label: "Health Conditions",
    type: "select",
    options: [
      "No health conditions affecting diving",
      "Yes, but cleared by doctor for diving",
      "Need medical clearance",
      "Prefer to discuss privately",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },

  // ---- Diving (filmmaking + photography) ----
  {
    key: "diving_types",
    label: "Types of Diving",
    type: "multiselect",
    options: [
      "Recreational Scuba diving", "Technical Scuba diving", "Snorkeling",
      "Technical diving", "Rebreather diving", "Neither, but interested in learning", "Freediving",
    ],
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "number_of_dives",
    label: "Number of Dives",
    type: "select",
    options: ["0-50", "51-250", "250+"],
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "diving_environments",
    label: "Diving Environments",
    type: "multiselect",
    options: [
      "Tropical Reefs", "Cold water", "Deep diving", "Night diving", "Cave / Wreck diving", "Other",
      "Open water", "Pool", "Deep pool",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },

  // ---- Equipment ----
  {
    key: "planning_to_invest",
    label: "Planning to Invest",
    type: "select",
    options: ["Yes, within the near future", "Yes, within the next years", "No immediate plans"],
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "equipment_owned",
    label: "Equipment Owned",
    type: "multiselect",
    options: [
      "Camera", "Underwater housing", "Video lights", "Wide-angle lens",
      "Macro lens", "Drone", "Gimbal / stabilizer", "Editing software",
      "No equipment yet", "Action camera (GoPro, Osmo, Insta360, etc)",
      "Compact camera with housing", "DSLR/Mirrorless with housing",
      "Professional video camera", "Lighting equipment", "Other",
    ],
    programs: ["filmmaking", "photography"],
    curated: false,
  },

  // ---- Creative Profile ----
  {
    key: "content_created",
    label: "Content Created",
    type: "multiselect",
    options: [
      "None yet, excited to start", "Personal vacation videos", "Social media content",
      "Documentary style", "Commercial work", "Scientific / research documentation",
      "Conservation stories", "Other",
      "Stills — underwater", "Stills — topside", "Video — underwater",
      "Video — topside", "Drone footage", "360 / VR",
    ],
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "online_presence",
    label: "Online Presence",
    type: "select",
    options: [
      "None", "Personal social media only", "Dedicated filming social media",
      "Website / portfolio", "Multiple platforms",
      "Active social media", "Personal website", "Professional portofolio",
      "Client base", "None of the above",
      "Professional portfolio",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "income_from_filming",
    label: "Income from Filming",
    type: "select",
    options: ["None", "Occasional / side income", "Part of my income", "Primary income source"],
    programs: ["filmmaking"],
    curated: false,
  },
  {
    key: "income_from_photography",
    label: "Income from Photography",
    type: "select",
    options: ["None", "Occasional / side income", "Part of my income", "Primary income source"],
    programs: ["photography"],
    curated: false,
  },

  // ---- Goals ----
  {
    key: "primary_goal",
    label: "Primary Goal",
    type: "select",
    options: [
      "Learn basics of underwater filming as a hobby",
      "Improve content creation for social media",
      "Transform hobby into professional career",
      "Enhance existing professional skills",
      "Document marine conservation/research",
      "Learn underwater photography from scratch", "Improve existing skills",
      "Transition to professional", "Build a portfolio",
      "Content creation", "Conservation / scientific documentation",
    ],
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "learning_aspects",
    label: "Learning Aspects",
    type: "multiselect",
    options: [
      "Basic equipment setup & operation", "Camera settings & techniques",
      "Lighting techniques", "Marine life behavior understanding",
      "Storytelling & content planning", "Post-production & editing",
      "Business aspects of underwater filming", "Client relations & project management",
      "Conservation documentation",
      "Camera settings & exposure", "Composition",
      "Post-production / editing", "Wide-angle photography", "Macro photography",
      "Video / filmmaking", "Business & marketing", "Conservation storytelling",
      "Body awareness", "Soul-body connection",
      "Sensitive marine wildlife interactions",
      "Techniques for expressive underwater movement",
      "Creating individual movement sequences and choreography",
      "Creative self-expression", "Business aspects of underwater performance",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "content_to_create",
    label: "Content to Create",
    type: "multiselect",
    options: [
      "Personal / travel memories", "Documentary style films",
      "Commercial / advertising content", "Scientific / research documentation",
      "Conservation stories",
      "Social media content", "Fine art prints", "Editorial / magazine",
      "Conservation / documentary", "Commercial / stock",
      "Personal portfolio", "Educational content",
    ],
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "learning_approach",
    label: "Learning Approach",
    type: "multiselect",
    options: [
      "One-on-one mentorship", "Group workshops", "Small group workshop",
      "Mixed approach (combination of group and individual)", "Project-based learning",
      "Online courses", "Self-paced learning", "Field trips", "Portfolio reviews",
      "Self-paced with guidance",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },
  {
    key: "marine_subjects",
    label: "Marine Subjects",
    type: "multiselect",
    options: [
      "Coral reefs", "Big marine life (sharks, whales, etc.)", "Macro subjects",
      "Marine behavior", "Conservation stories",
      "Large marine life (sharks, rays, whales)", "Macro / small creatures",
      "Wrecks", "Underwater landscapes / scenery", "Marine conservation",
      "Freediving / human subjects", "Cave / cenote environments",
    ],
    programs: ["filmmaking", "photography"],
    curated: false,
  },
  {
    key: "referral_source",
    label: "Referral Source",
    type: "multiselect",
    options: [
      "Social media", "Friend / family", "Google search", "BTM website",
      "Dive center / club", "Photography community", "Event / exhibition", "Other",
    ],
    programs: ["filmmaking", "photography", "freediving"],
    curated: false,
  },

  // ---- Freediving-specific selects ----
  {
    key: "number_of_sessions",
    label: "Freediving Sessions",
    type: "select",
    options: ["0-10", "11-50", "51-250", "250+"],
    programs: ["freediving"],
    curated: false,
  },
  {
    key: "practice_duration",
    label: "Practice Duration",
    type: "select",
    options: ["Less than 6 months", "6 months - 1 year", "1-2 years", "> 2 years"],
    programs: ["freediving"],
    curated: false,
  },
  {
    key: "performance_experience",
    label: "Performance Experience",
    type: "select",
    options: ["None", "Less than 1 year", "1-3 years", "3-5 years", "5+ years"],
    programs: ["freediving"],
    curated: false,
  },
  {
    key: "choreography_experience",
    label: "Choreography Experience",
    type: "select",
    options: ["No", "Yes, little experience", "Yes, extended experience"],
    programs: ["freediving"],
    curated: false,
  },
  {
    key: "filmed_underwater",
    label: "Filmed Underwater",
    type: "select",
    options: ["No", "Yes, little experience", "Yes, extended experience"],
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
