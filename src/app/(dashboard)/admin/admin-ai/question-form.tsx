"use client";

import { useActionState, useEffect, useRef } from "react";
import type { AdminAiProviderAvailability } from "@/lib/admin-ai/provider";
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
  contactId,
  providerAvailability,
  onResolved,
}: {
  scope: "global" | "contact";
  contactId?: string;
  providerAvailability: AdminAiProviderAvailability;
  onResolved: (state: AdminAiAskFormState) => void;
}) {
  const [state, formAction, isPending] = useActionState(
    askAdminAiQuestion,
    INITIAL_STATE,
  );
  const handledRef = useRef<string | null>(null);
  const isUnavailable = !providerAvailability.isConfigured;
  const disabled = isPending || isUnavailable;
  const unavailableReason =
    providerAvailability.unavailableReason ?? "Admin AI is not configured yet.";

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
      {contactId && <input type="hidden" name="contactId" value={contactId} />}

      {isUnavailable && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {unavailableReason} Add `OPENAI_API_KEY` on the server, then restart the app.
        </p>
      )}

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
          disabled={disabled}
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
          disabled={disabled}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Thinking…" : "Ask AI"}
        </button>
      </div>
    </form>
  );
}
