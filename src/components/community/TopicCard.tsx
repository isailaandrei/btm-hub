import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { ForumTopicDefinition } from "@/lib/community/topics";

export function TopicCard({ topic }: { topic: ForumTopicDefinition }) {
  return (
    <Link href={`/community/${topic.slug}`}>
      <Card className="h-full transition-colors hover:border-primary">
        <CardContent>
          <h3 className="text-sm font-medium text-foreground">
            {topic.name}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {topic.description}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
