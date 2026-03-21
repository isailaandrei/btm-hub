import Link from "next/link";
import type { ForumTopicDefinition } from "@/lib/community/topics";

export function TopicCard({ topic }: { topic: ForumTopicDefinition }) {
  return (
    <Link
      href={`/community/${topic.slug}`}
      className="group flex flex-col rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary"
    >
      <span className="mb-3 text-3xl">{topic.icon}</span>
      <h3 className="mb-1 text-base font-medium text-foreground group-hover:text-primary">
        {topic.name}
      </h3>
      <p className="text-sm text-muted-foreground">{topic.description}</p>
    </Link>
  );
}
