import Link from "next/link";
import { ThreadCard } from "./ThreadCard";
import { ChevronRight } from "lucide-react";
import type { ForumTopic, ForumThreadSummary } from "@/types/database";

interface TopicGroupProps {
  topic: ForumTopic;
  threads: ForumThreadSummary[];
}

export function TopicGroup({ topic, threads }: TopicGroupProps) {
  return (
    <section id={`topic-${topic.slug}`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {topic.name}
        </h2>
        <Link
          href={`/community?topic=${topic.slug}`}
          className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          See all
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {threads.map((thread) => (
          <ThreadCard key={thread.id} thread={thread} />
        ))}
      </div>
    </section>
  );
}
