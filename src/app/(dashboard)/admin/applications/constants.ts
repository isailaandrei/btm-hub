import type { ApplicationStatus, ProgramSlug } from "@/types/database";

export const STATUS_BADGE_CLASS: Record<ApplicationStatus, string> = {
  reviewing: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  accepted: "border-green-500/40 bg-green-500/10 text-green-400",
};

export const STATUSES: ApplicationStatus[] = ["reviewing", "accepted"];
export const PROGRAMS: ProgramSlug[] = ["photography", "filmmaking", "freediving", "modelling", "internship"];
