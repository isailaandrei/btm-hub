import type { ApplicationStatus, ProgramSlug } from "@/types/database";

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  reviewing: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  accepted: "bg-green-500/10 text-green-400 border-green-500/30",
};

export const STATUSES: ApplicationStatus[] = ["reviewing", "accepted"];
export const PROGRAMS: ProgramSlug[] = ["photography", "filmmaking", "freediving", "modelling", "internship"];
