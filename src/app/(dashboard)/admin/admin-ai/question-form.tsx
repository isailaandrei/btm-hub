"use client";

import { useActionState, useEffect, useRef } from "react";
import type { AdminAiAskFormState } from "./actions";
import { askAdminAiQuestion } from "./actions";

const INITIAL_STATE: AdminAiAskFormState = {
  errors: null,
  message: null,
  success: false,
  thread: null,
  messages: null,
};

export function QuestionForm({
  scope,
  threadId,
  threadTitle,
  threadCreatedAt,
  contactId,
  onResolved,
}: {
  scope: "global" | "contact";
  threadId: string | null;
  threadTitle?: string;
  threadCreatedAt?: string;
  contactId?: string;
  onResolved: (state: AdminAiAskFormState) => void;
}) {
  const [state, formAction, isPending] = useActionState(
    askAdminAiQuestion,
    INITIAL_STATE,
  );
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state.thread || !state.messages) return;
    const signature = [
      state.thread.id,
      state.messages.length,
      state.success ? "success" : "failed",
      state.message ?? "",
    ].join(":");
    if (handledRef.current === signature) return;
    handledRef.current = signature;
    onResolved(state);
  }, [onResolved, state]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="scope" value={scope} />
      {threadId && <input type="hidden" name="threadId" value={threadId} />}
      {threadId && threadTitle && (
        <input type="hidden" name="threadTitle" value={threadTitle} />
      )}
      {threadId && threadCreatedAt && (
        <input type="hidden" name="threadCreatedAt" value={threadCreatedAt} />
      )}
      {contactId && <input type="hidden" name="contactId" value={contactId} />}

      <div>
        <textarea
          name="question"
          rows={4}
          maxLength={2000}
          placeholder={
            scope === "contact"
              ? "Ask about this contact's fit, signals, and concerns..."
              : "Ask for a shortlist, synthesis, or grounded contact insight..."
          }
          disabled={isPending}
          className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary disabled:opacity-60"
        />
        {state.errors?.question && (
          <p className="mt-1 text-sm text-destructive">
            {state.errors.question[0]}
          </p>
        )}
        {state.errors?.contactId && (
          <p className="mt-1 text-sm text-destructive">
            {state.errors.contactId[0]}
          </p>
        )}
      </div>

      {state.message && (
        <p
          className={`text-sm ${
            state.success ? "text-muted-foreground" : "text-destructive"
          }`}
        >
          {state.message}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Thinking…" : "Ask AI"}
        </button>
      </div>
    </form>
  );
}
