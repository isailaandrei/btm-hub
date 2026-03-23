"use client";

import { useActionState } from "react";
import { RichTextEditor } from "./RichTextEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createThread } from "@/app/(marketing)/community/actions";
import { FORUM_TOPICS } from "@/lib/community/topics";

export function NewPostForm() {
  const [state, formAction, isPending] = useActionState(createThread, {
    errors: {},
    message: "",
    success: false,
    resetKey: 0,
  });

  const topics = Object.values(FORUM_TOPICS);

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="title" className="text-sm font-medium text-foreground">
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              minLength={3}
              maxLength={200}
              placeholder="What's on your mind?"
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {state.errors?.title && (
              <p className="text-sm text-destructive">{state.errors.title}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="topic" className="text-sm font-medium text-foreground">
              Topic <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <select
              id="topic"
              name="topic"
              defaultValue=""
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">No topic</option>
              {topics.map((topic) => (
                <option key={topic.slug} value={topic.slug}>
                  {topic.name}
                </option>
              ))}
            </select>
            {state.errors?.topic && (
              <p className="text-sm text-destructive">{state.errors.topic}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Body</label>
            <RichTextEditor
              name="body"
              placeholder="Write your post..."
              maxLength={20000}
              required
            />
            {state.errors?.body && (
              <p className="text-sm text-destructive">{state.errors.body}</p>
            )}
          </div>

          {state.message && !state.success && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}

          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Posting..." : "Post"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
