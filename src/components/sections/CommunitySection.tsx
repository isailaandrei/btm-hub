import { Tag } from "@/components/ui/Tag";

const TOPICS = [
  { label: "Underwater Filming", variant: "primary" as const },
  { label: "Gear Talk", variant: "ghost" as const },
  { label: "Marine Life", variant: "ghost" as const },
  { label: "Beginner Questions", variant: "ghost" as const },
];

export function CommunitySection() {
  return (
    <section className="bg-muted px-5 py-12 md:px-24 md:py-24">
      <div className="flex flex-col items-center gap-6 text-center md:gap-10">
        <div className="flex flex-col items-center gap-4 py-6">
          <h2 className="text-[length:var(--font-size-h1)] font-bold text-foreground">
            Join the Conversation
          </h2>
          <p className="max-w-3xl text-lg text-foreground">
            Our community forums are where ocean enthusiasts connect — share
            stories, ask questions, and learn from each other.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {TOPICS.map((topic) => (
            <Tag key={topic.label} variant={topic.variant}>
              {topic.label}
            </Tag>
          ))}
        </div>
      </div>
    </section>
  );
}
