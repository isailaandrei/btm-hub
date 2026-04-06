import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import { getForumTopics } from "@/lib/data/forum";

export async function CommunitySection() {
  const topics = await getForumTopics();
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
          {topics.map((topic, i) => (
            <Link key={topic.slug} href={`/community?topic=${topic.slug}`}>
              <Tag variant={i === 0 ? "primary" : "ghost"}>
                {topic.name}
              </Tag>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
