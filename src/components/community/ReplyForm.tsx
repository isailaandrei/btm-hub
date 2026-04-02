"use client";

import { useActionState, lazy, Suspense, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createReply } from "@/app/(marketing)/community/actions";

const RichTextEditor = lazy(() =>
  import("./RichTextEditor").then((m) => ({ default: m.RichTextEditor })),
);

function LazyEditorWrapper({ onReady }: { onReady: () => void }) {
  // useEffect equivalent: signal ready after the lazy component mounts
  const refCallback = (node: HTMLDivElement | null) => {
    if (node) onReady();
  };

  return (
    <div ref={refCallback}>
      <RichTextEditor
        name="body"
        placeholder="Write your reply..."
      />
    </div>
  );
}

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
  const [editorReady, setEditorReady] = useState(false);

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
            <Suspense
              fallback={
                <div className="h-32 animate-pulse rounded-lg border border-border bg-muted" />
              }
            >
              <LazyEditorWrapper onReady={() => setEditorReady(true)} />
            </Suspense>
            {state.errors?.body && (
              <p className="text-sm text-destructive">{state.errors.body}</p>
            )}
            {state.message && !state.success && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}
            <div>
              <Button type="submit" disabled={isPending || !editorReady}>
                {isPending ? "Posting..." : "Post Reply"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
