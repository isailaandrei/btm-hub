import type { ProgramSlug } from "@/types/database";

export interface ProgramDefinition {
  slug: ProgramSlug;
  name: string;
  shortDescription: string;
  icon: string | null;
  applicationOpen: boolean;
}

export const PROGRAMS: Record<ProgramSlug, ProgramDefinition> = {
  photography: {
    slug: "photography",
    name: "Photography",
    shortDescription: "Master the art of capturing life beneath the surface through mentorship-based training.",
    icon: null,
    applicationOpen: true,
  },
  filmmaking: {
    slug: "filmmaking",
    name: "Filmmaking",
    shortDescription: "Learn to tell compelling underwater stories through film, from shooting to post-production.",
    icon: null,
    applicationOpen: true,
  },
  freediving: {
    slug: "freediving",
    name: "Freediving & Modelling",
    shortDescription: "Develop your breath-hold diving and underwater performance skills through structured training and creative coaching.",
    icon: null,
    applicationOpen: true,
  },
  internship: {
    slug: "internship",
    name: "Internship",
    shortDescription: "Join the Behind the Mask team for an extended hands-on learning experience across all disciplines.",
    icon: null,
    applicationOpen: true,
  },
};

export const PROGRAM_SLUGS = Object.keys(PROGRAMS) as ProgramSlug[];

export function getProgram(slug: string): ProgramDefinition | undefined {
  return PROGRAMS[slug as ProgramSlug];
}

export function getOpenPrograms(): ProgramDefinition[] {
  return Object.values(PROGRAMS).filter((p) => p.applicationOpen);
}