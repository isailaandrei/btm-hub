// ---------------------------------------------------------------------------
// Option enums for all 4 academy application forms (filmmaking, photography,
// freediving & modelling, internship).
//
// SINGLE SOURCE OF TRUTH. Every option list used by a form field lives here.
// Values are copied verbatim from the live Google Forms authored by partner A
// (extracted 2026-04-11 — see docs/superpowers/specs/2026-04-11-forms-alignment-*).
// If partner A updates a Google Form, the corresponding constant here must be
// updated so new website submissions produce the same shape as existing
// applications.answers rows.
//
// Organization:
//   1. SHARED — personal / background
//   2. SHARED — health & fitness
//   3. SHARED — diving
//   4. SHARED — logistics
//   5. SHARED — BTM Academy
//   6. FILMMAKING-specific
//   7. PHOTOGRAPHY-specific
//   8. FREEDIVING-specific
//   9. INTERNSHIP-specific
// ---------------------------------------------------------------------------

// ===========================================================================
// SHARED — personal / background
// ===========================================================================

export const AGE_RANGES = [
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55+",
] as const;

export const GENDERS = [
  "Male",
  "Female",
  "Non-binary",
  "Prefer not to say",
] as const;

export const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Other"
] as const;

// ===========================================================================
// SHARED — health & fitness
// ===========================================================================

export const FITNESS_LEVELS = [
  "Excellent - Regular exercise, no health concerns",
  "Good - Moderately active, no major health concerns",
  "Average - Some physical activity, manageable health conditions",
  "Need improvement - Limited physical activity or health concerns",
  "Prefer to discuss privately",
  "Other"
] as const;

// Filmmaking / Photography / Internship use the "diving" phrasing.
export const HEALTH_CONDITIONS = [
  "No health conditions affecting diving",
  "Yes, but cleared by doctor for diving",
  "Need medical clearance",
  "Prefer to discuss privately",
] as const;

// Freediving & Modelling uses "freediving" phrasing — separate constant
// because the exact strings must match what the Google Form renders.
export const HEALTH_CONDITIONS_FREEDIVING = [
  "No health conditions affecting freediving",
  "Yes, but cleared by doctor for freediving",
  "Need medical clearance",
  "Prefer to discuss privately",
] as const;

// ===========================================================================
// SHARED — diving (filmmaking + photography + internship)
// ===========================================================================

export const DIVING_TYPES = [
  "Recreational Scuba diving",
  "Technical Scuba diving",
  "Rebreather diving",
  "Freediving",
  "Snorkeling",
  "Neither, but interested in learning",
  "Other"
] as const;

// Scuba certification levels shared by filmmaking, photography, and
// internship. The "Certified Freediver" sub-label differed slightly
// between forms — unified under the "Other" allowOther mechanism.
export const CERTIFICATION_LEVELS_SCUBA = [
  "No certification yet",
  "Open Water",
  "Advanced Open Water",
  "Rescue Diver",
  "Divemaster",
  "Instructor",
  "Technical Diving certification",
  "Other"
] as const;

export const NUMBER_OF_DIVES = ["0-50", "51-250", "250+"] as const;

// Filmmaking / Photography (no "Open water" option)
export const DIVING_ENVIRONMENTS_SCUBA = [
  "Tropical Reefs",
  "Cold water",
  "Deep diving",
  "Night diving",
  "Cave/Wreck diving",
] as const;

// ===========================================================================
// SHARED — logistics (filmmaking + photography + freediving)
// ===========================================================================

export const TIME_AVAILABILITY = [
  "1 week to 10 days for a workshop, a project or individual training",
  "2-3 entire weeks at a time for a workshop, a project or individual training",
  "now and then for online classes",
] as const;

export const TRAVEL_WILLINGNESS = [
  "Yes, willing to travel internationally",
  "Yes, but within my region only",
  "No, prefer local training only",
  "Depends on duration and location",
] as const;

export const BUDGETS = [
  "Very limited budget. I basically have no financial means to be spent on this.",
  "Small budget (under 1,000 €/USD)",
  "Moderate budget (1,000 - 3,000 €/USD)",
  "Advanced budget (3,000 - 6,000 €/USD)",
  "Professional budget (6,000 - 12,000 €/USD)",
  "All-In budget (>12,000 €/USD)",
] as const;

export const START_TIMELINES = [
  "Ready to start immediately",
  "Within next 3 months",
  "Within next 6 months",
  "Flexible/Not sure yet",
] as const;

export const PLANNING_TO_INVEST = [
  "Yes, within the near future",
  "Yes, within the next years",
  "No immediate plans",
] as const;

export const REFERRAL_SOURCES = [
  "Social Media (Instagram, Facebook, etc.)",
  "Word of mouth",
  "Online search",
  "Diving community",
  "Conservation organisation",
] as const;

// ===========================================================================
// SHARED — BTM Academy
// ===========================================================================

// Filmmaking + Photography — 5 options.
export const BTM_CATEGORIES_MEDIA = [
  "BEGINNER - Creative Explorer (Just starting, hobby-focused, seeking basic skills)",
  "INDEPENDENT CREATOR (Experienced hobbyist/influencer seeking improvement)",
  "ASPIRING PROFESSIONAL (Part-time professional aiming for full-time career)",
  "DEDICATED ACHIEVER (Business-focused, seeking intensive mentorship)",
  "OCEAN STEWARD (NGO/scientific focus, conservation-driven)",
] as const;

// Freediving & Modelling — 3 options. Note the different "ASPIRING
// PROFESSIONAL" parenthetical ("Actor/model aiming to expand skill-set")
// which is why this is a separate constant rather than a subset.
export const BTM_CATEGORIES_FREEDIVING = [
  "BEGINNER - Creative Explorer (Just starting, hobby-focused, seeking basic skills)",
  "INDEPENDENT CREATOR (Experienced hobbyist/influencer seeking improvement)",
  "ASPIRING PROFESSIONAL (Actor/model aiming to expand skill-set)",
] as const;

// Filmmaking + Photography (Google Form question label is
// "Current involvement in underwater filming/photography"). Includes Other
// free text in the Google Form, so the field should set allowOther: true.
export const INVOLVEMENT_LEVELS = [
  "Complete beginner",
  "Hobby only",
  "Part-time professional",
  "Full-time professional",
  "Conservation/Scientific work",
] as const;

// Shared across filmmaking, photography, and freediving.
export const ONLINE_PRESENCE = [
  "Active social media",
  "Personal website",
  "Professional portfolio",
  "Client base",
  "None of the above",
] as const;

// Shared across filmmaking, photography, and freediving.
export const LEARNING_APPROACHES = [
  "Group workshops (within a group of approx. 10 persons)",
  "Small group workshop (within a group of approx. 4 persons)",
  "One-on-one mentorship",
  "Mixed approach (combination of group and individual)",
  "Project-based learning (within a BTM project)",
] as const;

// Income question — same options for filmmaking and photography; the
// question label differs ("…from underwater filming/photography") but the
// answer list is identical.
export const MEDIA_INCOME = [
  "No, that's not my goal.",
  "No, not yet.",
  "Occasionally (few projects per year)",
  "Regular part-time income",
  "Full-time income",
  "Prefer not to say",
] as const;

// Years-of-experience bucket (shared between filmmaking and photography —
// the Google Form uses "Years of experience in underwater filming/photography"
// with the same 5 buckets).
export const YEARS_EXPERIENCE = [
  "None",
  "Less than 1 year",
  "1-3 years",
  "3-5 years",
  "5+ years",
] as const;

// ===========================================================================
// FILMMAKING-specific
// ===========================================================================

export const FILMMAKING_EQUIPMENT = [
  "No equipment yet",
  "Action camera (GoPro, Osmo, Insta360, etc)",
  "Compact camera with housing",
  "DSLR/Mirrorless with housing",
  "Professional video camera",
  "Lighting equipment",
] as const;

export const FILMMAKING_CONTENT_CREATED = [
  "None yet, excited to start",
  "Personal vacation videos",
  "Social media content",
  "Documentary style",
  "Commercial work",
  "Scientific/Research documentation",
] as const;

export const FILMMAKING_GOALS = [
  "Learn basics of underwater filming as a hobby",
  "Improve content creation for social media",
  "Transform hobby into professional career",
  "Enhance existing professional skills",
  "Document marine conservation/research",
] as const;

export const FILMMAKING_LEARNING_ASPECTS = [
  "Basic equipment setup and operation",
  "Camera settings and techniques",
  "Lighting techniques",
  "Marine life behavior understanding",
  "Storytelling and content planning",
  "Post-production and editing",
  "Business aspects of underwater filming",
  "Client relations and project management",
  "Conservation documentation",
] as const;

export const FILMMAKING_CONTENT_TO_CREATE = [
  "Personal/travel memories",
  "Social media content",
  "Documentary style films",
  "Commercial/advertising content",
  "Scientific/research documentation",
  "Conservation stories",
] as const;

// Filmmaking + Photography share the same 5 marine subject options — the
// Google Forms use the same list.
export const MARINE_SUBJECTS_MEDIA = [
  "Coral reefs",
  "Big marine life (sharks, whales, etc.)",
  "Macro subjects",
  "Marine behavior",
  "Conservation stories",
] as const;

// ===========================================================================
// PHOTOGRAPHY-specific
// ===========================================================================

// Note: "Professional photo/video camera" (differs from filmmaking's
// "Professional video camera").
export const PHOTOGRAPHY_EQUIPMENT = [
  "No equipment yet",
  "Action camera (GoPro, Osmo, Insta360, etc)",
  "Compact camera with housing",
  "DSLR/Mirrorless with housing",
  "Professional photo/video camera",
  "Lighting equipment",
] as const;

export const PHOTOGRAPHY_CONTENT_CREATED = [
  "None yet, excited to start",
  "Personal vacation photography",
  "Social media content",
  "Documentary style",
  "Commercial work",
  "Scientific/Research documentation",
] as const;

export const PHOTOGRAPHY_GOALS = [
  "Learn basics of underwater photography as a hobby",
  "Improve content creation for social media",
  "Transform hobby into professional career",
  "Enhance existing professional skills",
  "Document marine conservation/research",
] as const;

export const PHOTOGRAPHY_LEARNING_ASPECTS = [
  "Basic equipment setup and operation",
  "Camera settings and techniques",
  "Lighting techniques",
  "Marine life behavior understanding",
  "Composition and content planning",
  "Post-production and editing",
  "Business aspects of underwater photography",
  "Client relations and project management",
  "Conservation documentation",
] as const;

export const PHOTOGRAPHY_CONTENT_TO_CREATE = [
  "Personal/travel memories",
  "Social media content",
  "Documentary style photo series",
  "Commercial/advertising content",
  "Scientific/research documentation",
  "Conservation stories",
] as const;

// ===========================================================================
// FREEDIVING-specific
// ===========================================================================

export const FREEDIVING_CERTIFICATION_LEVELS = [
  "No certification yet",
  "AIDA 1 or equivalent",
  "AIDA 2 or equivalent",
  "AIDA 3 or equivalent",
  "AIDA 4 or equivalent",
  "Freediving Instructor",
] as const;

export const NUMBER_OF_SESSIONS = ["0-50", "51-250", "250+"] as const;

export const PRACTICE_DURATION = [
  "Less than 1 year",
  "> 1 year",
  "> 2 years",
  "> 3 years",
  "> 5 years",
  "> 10 years",
] as const;

export const PERFORMANCE_EXPERIENCE = [
  "None",
  "Less than 1 year",
  "1-3 years",
  "3-5 years",
  "5+ years",
] as const;

export const FREEDIVING_ENVIRONMENTS = [
  "Tropical Reefs",
  "Open water",
  "Pool",
  "Deep pool",
  "Cold water",
  "Deep diving",
  "Night diving",
] as const;

export const LAND_MOVEMENT_SPORTS = [
  "None",
  "Yoga",
  "Dance",
  "Martial Arts",
  "Acrobatics",
  "Modeling",
] as const;

export const CHOREOGRAPHY_EXPERIENCE = [
  "No",
  "Yes, little experience",
  "Yes, extended experience",
] as const;

export const FILMED_UNDERWATER = [
  "No",
  "Yes, little experience",
  "Yes, extended experience",
] as const;

export const FREEDIVING_LEARNING_ASPECTS = [
  "Body awareness",
  "Soul-body connection",
  "Marine life behavior understanding",
  "Sensitive marine wildlife interactions",
  "Techniques for expressive underwater movement",
  "Creating individual movements sequences and choreography",
  "Creative self-expression",
  "Business aspects of underwater performance",
  "Client relations and project management",
] as const;

export const FREEDIVING_GOALS = [
  "Learn basics of expressive underwater movement as a hobby",
  "Improve content creation for social media",
  "Transform hobby into professional career",
  "Enhance existing professional skills",
  "Enjoy the community, network and socialise with likeminded people",
] as const;

export const PROFESSIONAL_MATERIAL_PURPOSE = [
  "No, that's not my goal",
  "Yes, for personal/travel memories",
  "Yes, for commercial purposes",
] as const;

// ===========================================================================
// INTERNSHIP-specific
// ===========================================================================

export const INTERNSHIP_EDUCATION_LEVELS = [
  "Secondary school diploma",
  "High school diploma",
  "Vocational training / apprenticeship",
  "Bachelor's degree",
  "Master's degree",
  "Doctorate / PhD",
] as const;

export const INTERNSHIP_CONTENT_CREATED = [
  "None yet, excited to start",
  "Personal vacation videos",
  "Social media content",
  "Documentary style",
  "Commercial work",
  "Scientific/Research documentation",
  "Overwater photography",
  "Underwater photography",
] as const;

// Internship adds "Open water" to the scuba list (it's in the Google Form).
export const INTERNSHIP_DIVING_ENVIRONMENTS = [
  "Tropical Reefs",
  "Open water",
  "Cold water",
  "Deep diving",
  "Night diving",
  "Cave/Wreck diving",
] as const;
