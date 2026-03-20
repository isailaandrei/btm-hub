// ---------------------------------------------------------------------------
// Shared option lists used across program forms
// ---------------------------------------------------------------------------

// Diving-related
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

// Profile
export const BTM_CATEGORIES = [
  "Beginner",
  "Enthusiast",
  "Semi-professional",
  "Professional",
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

// Experience & involvement
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

export const INVOLVEMENT_LEVELS = [
  "Hobby",
  "Part-time",
  "Full-time",
  "Transitioning to full-time",
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
