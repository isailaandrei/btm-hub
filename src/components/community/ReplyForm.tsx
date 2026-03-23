"use client";

import { useActionState } from "react";
import Link from "next/link";
import { RichTextEditor } from "./RichTextEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createReply } from "@/app/(marketing)/community/actions";

interface ReplyFormProps {
  threadId: string;
  isLocked: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  redirectPath: string;
}

export function ReplyForm({
  threadId,
  isLocked,
  isAuthenticated,
  isAdmin,
  redirectPath,
}: ReplyFormProps) {
  const [state, formAction, isPending] = useActionState(createReply, {
    errors: {},
    message: "",
    success: false,
    resetKey: 0,
  });

  if (!isAuthenticated) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            <Link
              href={`/login?redirect=${encodeURIComponent(redirectPath)}`}
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            >
              Log in
            </Link>{" "}
            to reply to this post.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLocked && !isAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            This thread is locked. No new replies can be added.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {state.success && (
        <p className="text-sm text-green-600">Reply posted!</p>
      )}
      <Card>
        <CardContent>
          <form key={state.resetKey} action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="threadId" value={threadId} />
            <h3 className="text-sm font-medium text-foreground">Reply</h3>
            <RichTextEditor
              name="body"
              placeholder="Write your reply..."
              maxLength={10000}
              required
            />
            {state.errors?.body && (
              <p className="text-sm text-destructive">{state.errors.body}</p>
            )}
            {state.message && !state.success && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}
            <div>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Posting..." : "Post Reply"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
