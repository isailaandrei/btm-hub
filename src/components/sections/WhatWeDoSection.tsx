import { SectionHeader } from "@/components/sections/SectionHeader";
import { FeatureCard } from "@/components/sections/FeatureCard";

const FEATURES = [
  {
    title: "Underwater Film & Content",
    description:
      "We tell underwater stories through films, documentaries, and tutorials — capturing the magic that happens down there.",
  },
  {
    title: "Travel & Expeditions",
    description:
      "Dive into the unknown with our curated group expeditions to premier underwater destinations around the world.",
  },
  {
    title: "Community Hub",
    description:
      "Connect with fellow ocean enthusiasts in forums, share trip reports, discuss gear, and learn from each other.",
  },
  {
    title: "Shop & Merch",
    description:
      "Gear up with Behind the Mask merchandise, digital products, and curated gear guides from our team.",
  },
] as const;

function IconPlaceholder() {
  return <div className="h-6 w-6 rounded bg-white/30" />;
}

export function WhatWeDoSection() {
  return (
    <section className="bg-background px-5 py-12 md:px-24 md:py-24">
      <SectionHeader
        title="What We Do"
        description="Academy. Community. Shop. We connect people to the ocean through learning, stories, and shared passion."
      />
      <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 md:mt-12 md:grid-cols-4 md:gap-8">
        {FEATURES.map((feature) => (
          <FeatureCard
            key={feature.title}
            icon={<IconPlaceholder />}
            title={feature.title}
            description={feature.description}
          />
        ))}
      </div>
    </section>
  );
}
