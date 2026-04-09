// ---------------------------------------------------------------------------
// Shared option lists used across program forms
// ---------------------------------------------------------------------------

// Diving-related
export const DIVING_TYPES = [
  "Recreational Scuba diving",
  "Technical Scuba diving",
  "Rebreather diving",
  "Freediving",
  "Snorkeling",
  "Neither, but interested in learning",
] as const;

export const CERTIFICATION_LEVELS = [
  "None",
  "Open Water (OW)",
  "Advanced Open Water (AOW)",
  "Rescue Diver",
  "Divemaster",
  "Instructor",
  "Technical Diving certification",
  "Certified Freediver, please specify below"
] as const;

export const FITNESS_LEVELS = [
  "Excellent - Regular exercise, no health concerns",
  "Good - Moderately active, no major health concerns",
  "Average - Some physical activity, manageable health conditions",
  "Need improvement - Limited physical activity or health concerns",
  "Prefer to discuss privately"
] as const;

export const HEALTH_CONDITIONS = [
  "No health conditions affecting diving",
  "Yes, but cleared by doctor for diving",
  "Need medical clearance",
  "Prefer to discuss privately"
] as const;

export const AGE_RANGES = [
  "Under 18",
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


export const NUMBER_OF_DIVES = [
  "0-50",
  "51-250",
  "250+",
] as const;

export const DIVING_ENVIRONMENTS = [
  "Tropical Reefs",
  "Cold water",
  "Deep diving",
  "Night diving",
  "Cave / Wreck diving",
  "Other",
] as const;

// Profile
export const BTM_CATEGORIES = [
  "BEGINNER - Creative Explorer (Just starting, hobby-focused, seeking basic skills)",
  "INDEPENDENT CREATOR (Experienced hobbyist/influencer seeking improvement)",
  "ASPIRING PROFESSIONAL (Part-time professional aiming for full-time career)",
  "DEDICATED ACHIEVER (Business-focused, seeking intensive mentorship)",
  "OCEAN STEWARD (NGO/scientific focus, conservation-driven)"
] as const;

// Logistics
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
  "$3,000 - $6,000",
  "$6,000 - $12,000",
  "$12,000+",
] as const;

export const START_TIMELINES = [
  "Immediately",
  "Within 1 month",
  "Within 3 months",
  "Within 6 months",
  "Within a year",
  "Not sure yet",
] as const;

// Experience & involvement
export const PLANNING_TO_INVEST = [
  "Yes, within the near future",
  "Yes, within the next years",
  "No immediate plans"
] as const;

export const YEARS_EXPERIENCE = [
  "None",
  "Less than 1 year",
  "1-2 years",
  "3-5 years",
  "5+"
] as const;

export const INVOLVEMENT_LEVELS = [
  "Complete beginner",
  "Hobby only",
  "Part-time",
  "Full-time",
  "Conservation / Scientific work",
] as const;

// Referral
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


// Photography / Filmmaking

export const EQUIPMENT_OWNED = [
  "No equipment yet",
  "Action camera (GoPro, Osmo, Insta360, etc)",
  "Compact camera with housing",
  "DSLR/Mirrorless with housing",
  "Professional video camera",
  "Lighting equipment",
  "Drone",
  "Other"
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

export const ONLINE_PRESENCE = [
  "Active social media",
  "Personal website",
  "Professional portofolio",
  "Client base",
  "None of the above",
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
