"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import type { AdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import type { AdminAiProgressSnapshot } from "@/lib/admin-ai/progress";
import { cn } from "@/lib/utils";
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

// Example questions surfaced as one-click chips under the hero ask box.
// Copy mirrors real owner questions so the chips teach the query vocabulary
// the corpus actually answers well. Only include question TYPES the pipeline
// has proven on (eval-backed); e.g. a "commitments/travel" chip was removed
// Jul 2026 because the corpus can't answer it meaningfully yet.
const SUGGESTIONS: Array<{ label: string; question: string }> = [
  {
    label: "Shortlist candidates",
    question:
      "Who are the strongest candidates for the 26 Coral Catch? Rank them and name your concerns.",
  },
  {
    label: "Find a skill",
    question:
      "Which contacts have professional underwater photo or video experience?",
  },
];

// Copy rule: counts must never read as coverage limits. Every contact in the
// corpus is examined by the scan; "flagged" is the scan's OUTPUT. An admin
// once read "164 candidates" as "only 164 of 308 were analyzed" — hence the
// explicit contact total on every line.
function describeProgress(progress: AdminAiProgressSnapshot): string {
  switch (progress.stage) {
    case "planning":
      return "Planning constraints...";
    case "scanning": {
      const total =
        progress.contactTotal !== undefined
          ? `all ${progress.contactTotal} contacts`
          : "contacts";
      const chunks =
        progress.chunkTotal !== undefined
          ? ` (chunk ${progress.chunksDone ?? 0}/${progress.chunkTotal})`
          : "";
      const flagged = progress.candidateCount
        ? ` — ${progress.candidateCount} flagged so far`
        : "";
      return `Scanning ${total}${chunks}${flagged}...`;
    }
    case "analyzing": {
      if (
        progress.candidateCount &&
        progress.contactTotal &&
        progress.candidateCount < progress.contactTotal
      ) {
        return `Analyzing ${progress.candidateCount} flagged candidates (all ${progress.contactTotal} contacts were scanned)...`;
      }
      return progress.candidateCount
        ? `Analyzing ${progress.candidateCount} contacts...`
        : "Analyzing candidates...";
    }
  }
}

export function QuestionForm({
  scope,
  contactId,
  providerAvailability,
  onResolved,
  variant = "compact",
}: {
  scope: "global" | "contact";
  contactId?: string;
  providerAvailability: AdminAiProviderAvailability;
  onResolved: (state: AdminAiAskFormState) => void;
  /** "hero" renders the large centered ask box (global AI tab); "compact"
   * keeps the dense inline form (contact page panel). */
  variant?: "hero" | "compact";
}) {
  const [state, formAction, isPending] = useActionState(
    askAdminAiQuestion,
    INITIAL_STATE,
  );
  const handledRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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

  function applySuggestion(question: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.value = question;
    textarea.focus();
  }

  function submitOnEnter(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || disabled) return;
    if (!event.currentTarget.value.trim()) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  const isHero = variant === "hero";

  const feedback = (
    <>
      {state.errors?.question && (
        <p className={cn("mt-2 text-sm text-destructive", isHero && "text-center")}>
          {state.errors.question[0]}
        </p>
      )}
      {state.errors?.contactId && (
        <p className={cn("mt-2 text-sm text-destructive", isHero && "text-center")}>
          {state.errors.contactId[0]}
        </p>
      )}
      {state.message && (
        <p
          className={cn(
            "mt-2 text-sm",
            state.success ? "text-muted-foreground" : "text-destructive",
            isHero && "text-center",
          )}
        >
          {state.message}
        </p>
      )}
      {isPending && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "mt-3 flex items-center gap-2 rounded-full border border-primary/20 bg-white/90 px-4 py-2 text-sm text-muted-foreground shadow-sm",
            isHero ? "mx-auto w-fit" : "w-fit",
          )}
        >
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>{progress ? describeProgress(progress) : "AI is thinking"}</span>
        </div>
      )}
    </>
  );

  const askBox = (
    <div
      className={cn(
        "rounded-2xl bg-gradient-to-r from-chart-2 via-primary to-chart-1 p-px transition-shadow",
        isHero
          ? "shadow-lg shadow-primary/15 focus-within:shadow-xl focus-within:shadow-primary/25"
          : "shadow-sm focus-within:shadow-md focus-within:shadow-primary/15",
      )}
    >
      <div className="relative rounded-[calc(var(--radius)+7px)] bg-white">
        <textarea
          ref={textareaRef}
          name="question"
          rows={isHero ? 4 : 3}
          maxLength={2000}
          onKeyDown={submitOnEnter}
          placeholder={
            scope === "contact"
              ? "Ask about this contact's fit, signals, and concerns..."
              : "Ask for a shortlist, synthesis, or grounded contact insight..."
          }
          disabled={disabled}
          className={cn(
            "w-full resize-none rounded-[inherit] bg-transparent text-foreground outline-none placeholder:text-muted-foreground/80 disabled:opacity-60",
            isHero ? "px-5 py-4 pr-16 text-base" : "px-4 py-3 pr-14 text-sm",
          )}
        />
        <button
          type="submit"
          disabled={disabled}
          aria-label="Ask AI"
          className={cn(
            "absolute grid place-items-center rounded-full bg-primary text-primary-foreground transition-all hover:opacity-90 disabled:opacity-40",
            isHero ? "bottom-3 right-3 size-10" : "bottom-2.5 right-2.5 size-8",
          )}
        >
          {isPending ? (
            <Loader2 className={cn("animate-spin", isHero ? "size-5" : "size-4")} />
          ) : (
            <ArrowUp className={isHero ? "size-5" : "size-4"} />
          )}
        </button>
      </div>
    </div>
  );

  const hiddenFields = (
    <>
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="progressId" value={progressId} />
      {contactId && <input type="hidden" name="contactId" value={contactId} />}
    </>
  );

  if (!isHero) {
    return (
      <form action={formAction} className="space-y-1">
        {hiddenFields}
        {isUnavailable && (
          <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {unavailableReason} Add `OPENAI_API_KEY` on the server, then restart
            the app.
          </p>
        )}
        {askBox}
        {feedback}
      </form>
    );
  }

  return (
    <form action={formAction}>
      {hiddenFields}
      <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-b from-primary/10 via-primary/[0.04] to-transparent px-6 py-10 sm:px-10 sm:py-12">
        {/* Atmosphere: two soft ocean glows behind the content. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-28 left-1/2 h-64 w-[38rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-36 right-[-8%] h-72 w-72 rounded-full bg-chart-2/25 blur-3xl"
        />

        <div className="relative mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            What do you want to know?
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Shortlists, rankings, and grounded answers — across every contact
            and conversation.
          </p>

          {isUnavailable && (
            <p className="mx-auto mt-5 max-w-xl rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {unavailableReason} Add `OPENAI_API_KEY` on the server, then
              restart the app.
            </p>
          )}

          <div className="mt-6">{askBox}</div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {SUGGESTIONS.map(({ label, question }) => (
              <button
                key={label}
                type="button"
                disabled={disabled}
                onClick={() => applySuggestion(question)}
                title={question}
                className="rounded-full border border-border bg-white/80 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>

          {feedback}
        </div>
      </section>
    </form>
  );
}
