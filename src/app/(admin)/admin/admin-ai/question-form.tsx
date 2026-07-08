"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import type { AdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import type { AdminAiProgressSnapshot } from "@/lib/admin-ai/progress";
import type { AdminAiAskFormState } from "./actions";
import { askAdminAiQuestion } from "./actions";

const INITIAL_STATE: AdminAiAskFormState = {
  errors: null,
  message: null,
  success: false,
  thread: null,
  messages: null,
};

const PROGRESS_POLL_INTERVAL_MS = 2000;

function describeProgress(progress: AdminAiProgressSnapshot): string {
  switch (progress.stage) {
    case "planning":
      return "Planning constraints...";
    case "scanning": {
      const chunks =
        progress.chunkTotal !== undefined
          ? ` (chunk ${progress.chunksDone ?? 0}/${progress.chunkTotal}${
              progress.candidateCount ? `, ${progress.candidateCount} candidates` : ""
            })`
          : "";
      return `Scanning contacts${chunks}...`;
    }
    case "analyzing":
      return progress.candidateCount
        ? `Analyzing ${progress.candidateCount} candidates...`
        : "Analyzing candidates...";
  }
}

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
  // One progress id per ask; rotated after each resolution (render-time
  // adjustment below) so a stale row from the previous answer can never bleed
  // into the next one's display. Poll results carry the id they were fetched
  // for, and rendering ignores any snapshot whose id doesn't match — no
  // effect-body state clearing needed.
  const [progressId, setProgressId] = useState(() => crypto.randomUUID());
  const [polled, setPolled] = useState<{
    id: string;
    snapshot: AdminAiProgressSnapshot;
  } | null>(null);
  const isUnavailable = !providerAvailability.isConfigured;
  const disabled = isPending || isUnavailable;
  const unavailableReason =
    providerAvailability.unavailableReason ?? "Admin AI is not configured yet.";
  const progress =
    isPending && polled?.id === progressId ? polled.snapshot : null;

  // Poll the stage-progress row while a GLOBAL answer is running. Best-effort:
  // poll errors are logged and skipped (the spinner alone is the fallback).
  // Polling MUST go through a plain GET route, not a server action — React
  // serializes server actions per client, so an action-based poll queues
  // behind the pending ask and never runs until the answer resolves.
  useEffect(() => {
    if (!isPending || scope !== "global") return;
    const pollId = progressId;
    let active = true;
    const interval = setInterval(() => {
      fetch(`/api/admin-ai/progress?id=${encodeURIComponent(pollId)}`, {
        cache: "no-store",
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<{
            snapshot: AdminAiProgressSnapshot | null;
          }>;
        })
        .then(({ snapshot }) => {
          if (active && snapshot) setPolled({ id: pollId, snapshot });
        })
        .catch((error) => {
          console.warn("Admin AI progress poll failed", error);
        });
    }, PROGRESS_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isPending, progressId, scope]);

  const resolvedSignature =
    state.thread && state.messages
      ? [
          state.thread.id,
          state.messages.length,
          state.success ? "success" : "failed",
          state.message ?? "",
        ].join(":")
      : null;

  // Render-time state adjustment (not an effect): rotate the progress id once
  // per resolved ask so the next submission polls a fresh row.
  const [rotatedFor, setRotatedFor] = useState<string | null>(null);
  if (resolvedSignature && rotatedFor !== resolvedSignature) {
    setRotatedFor(resolvedSignature);
    setProgressId(crypto.randomUUID());
  }

  useEffect(() => {
    if (!resolvedSignature) return;
    if (handledRef.current === resolvedSignature) return;
    handledRef.current = resolvedSignature;
    onResolved(state);
  }, [onResolved, resolvedSignature, state]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="progressId" value={progressId} />
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
          className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground shadow-sm placeholder-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
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

      {isPending && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-lg border border-primary/20 bg-white px-3 py-2 text-sm text-muted-foreground shadow-sm"
        >
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>{progress ? describeProgress(progress) : "AI is thinking"}</span>
        </div>
      )}

      <div className="flex justify-start">
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{isPending ? "Thinking..." : "Ask AI"}</span>
        </button>
      </div>
    </form>
  );
}
