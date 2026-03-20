import type { ForumTopicSlug } from "@/types/database";

export interface ForumTopicDefinition {
  slug: ForumTopicSlug;
  name: string;
  description: string;
  icon: string;
}

export const FORUM_TOPICS: Record<ForumTopicSlug, ForumTopicDefinition> = {
  "trip-reports": {
    slug: "trip-reports",
    name: "Trip Reports",
    description: "Share your dive adventures and trip experiences from around the world.",
    icon: "🌍",
  },
  "underwater-filmmaking-photography": {
    slug: "underwater-filmmaking-photography",
    name: "Underwater Filmmaking & Photography",
    description: "Techniques, critiques, and inspiration for shooting beneath the surface.",
    icon: "📸",
  },
  "gear-talk": {
    slug: "gear-talk",
    name: "Gear Talk",
    description: "Discuss cameras, housings, lights, fins, and everything in between.",
    icon: "🔧",
  },
  "marine-life": {
    slug: "marine-life",
    name: "Marine Life",
    description: "Identify species, share sightings, and discuss ocean conservation.",
    icon: "🐠",
  },
  freediving: {
    slug: "freediving",
    name: "Freediving",
    description: "Training tips, breath-hold techniques, and freediving stories.",
    icon: "🤿",
  },
  "beginner-questions": {
    slug: "beginner-questions",
    name: "Beginner Questions",
    description: "New to diving or underwater content creation? Ask anything here.",
    icon: "💬",
  },
};

export const FORUM_TOPIC_SLUGS = Object.keys(FORUM_TOPICS) as ForumTopicSlug[];

export function getForumTopic(slug: string): ForumTopicDefinition | undefined {
  return FORUM_TOPICS[slug as ForumTopicSlug];
}
