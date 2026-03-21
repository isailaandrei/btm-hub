"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { MarkdownEditor } from "./MarkdownEditor";
import { Button } from "@/components/ui/button";
import { createReply } from "@/app/(marketing)/community/actions";

interface ReplyFormProps {
  threadId: string;
  isLocked: boolean;
  isAuthenticated: boolean;
  redirectPath: string;
}

export function ReplyForm({
  threadId,
  isLocked,
  isAuthenticated,
  redirectPath,
}: ReplyFormProps) {
  const [state, formAction, isPending] = useActionState(createReply, {
    errors: {},
    message: "",
    success: false,
  });

  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.success) {
      setFormKey((k) => k + 1);
    }
  }, [state.success]);

  if (!isAuthenticated) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          <Link
            href={`/login?redirect=${encodeURIComponent(redirectPath)}`}
            className="text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Log in
          </Link>{" "}
          to reply to this thread.
        </p>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          This thread is locked. No new replies can be added.
        </p>
      </div>
    );
  }

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="threadId" value={threadId} />
      <h3 className="text-base font-medium text-foreground">Reply</h3>
      <MarkdownEditor
        name="body"
        placeholder="Write your reply... (supports Markdown)"
        maxLength={10000}
        rows={5}
        required
      />
      {state.errors?.body && (
        <p className="text-sm text-destructive">{state.errors.body}</p>
      )}
      {state.message && !state.success && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {state.success && (
        <p className="text-sm text-green-600">Reply posted!</p>
      )}
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Posting..." : "Post Reply"}
        </Button>
      </div>
    </form>
  );
}
