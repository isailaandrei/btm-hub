"use client";

import { useActionState } from "react";
import { MarkdownEditor } from "./MarkdownEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createThread } from "@/app/(marketing)/community/actions";

interface NewThreadFormProps {
  topic: string;
}

export function NewThreadForm({ topic }: NewThreadFormProps) {
  const [state, formAction, isPending] = useActionState(createThread, {
    errors: {},
    message: "",
    success: false,
    resetKey: 0,
  });

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="topic" value={topic} />

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
              placeholder="What's your thread about?"
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {state.errors?.title && (
              <p className="text-sm text-destructive">{state.errors.title}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Body</label>
            <MarkdownEditor
              name="body"
              placeholder="Write your post... (supports Markdown)"
              maxLength={20000}
              rows={12}
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
              {isPending ? "Creating..." : "Create Thread"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
