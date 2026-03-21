import { FORUM_TOPICS } from "@/lib/community/topics";
import { TopicCard } from "./TopicCard";

export function TopicGrid() {
  const topics = Object.values(FORUM_TOPICS);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {topics.map((topic) => (
        <TopicCard key={topic.slug} topic={topic} />
      ))}
    </div>
  );
}
