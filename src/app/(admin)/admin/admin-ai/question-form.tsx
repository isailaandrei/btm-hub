"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import type { AdminAiProgressSnapshot } from "@/lib/admin-ai/progress";
import type { AdminAiMessageStatus } from "@/types/admin-ai";
import { cn } from "@/lib/utils";
import type { AdminAiAskFormState } from "./actions";
import { loadAdminAiThread, startAdminAiQuestion } from "./actions";

const INITIAL_STATE: AdminAiAskFormState = {
  errors: null,
  message: null,
  success: false,
  thread: null,
  messages: null,
};

const PROGRESS_POLL_INTERVAL_MS = 2000;
// Client-side stall guard (display-only, never fabricates a failure into the
// thread): if the continuation hasn't resolved after this long, the server
// likely restarted mid-run — stop polling and tell the admin to check back.
const AWAITING_STALL_MS = 8 * 60 * 1000;

type Awaiting = {
  threadId: string;
  messageId: string;
  progressId: string;
  startedAt: number;
};

// Copy rule: counts must never read as coverage limits. Every contact in the
// corpus is examined by the scan; "flagged" is the scan's OUTPUT. An admin
// once read "164 candidates" as "only 164 of 308 were analyzed" — hence the
// explicit contact total on every line. Corollary (Jul 31 2026): when a
// deterministic constraint excluded contacts BEFORE the scan, "all N" reads as
// a miscount of the database ("292 scanned but we have 312") — so exclusions
// are named with the corpus total, never hidden.
function describeProgress(progress: AdminAiProgressSnapshot): string {
  const excluded = progress.excludedTotal ?? 0;
  const excludedNote = excluded
    ? ` — ${excluded} excluded (${progress.excludedReason ?? "by the question's filters"})`
    : "";
  const scannedTotal = (contactTotal: number): string =>
    excluded
      ? `${contactTotal} of ${contactTotal + excluded} contacts`
      : `all ${contactTotal} contacts`;
  switch (progress.stage) {
    case "planning":
      return "Planning constraints...";
    case "scanning": {
      const total =
        progress.contactTotal !== undefined
          ? scannedTotal(progress.contactTotal)
          : "contacts";
      const chunks =
        progress.chunkTotal !== undefined
          ? ` (chunk ${progress.chunksDone ?? 0}/${progress.chunkTotal})`
          : "";
      const flagged = progress.candidateCount
        ? ` — ${progress.candidateCount} flagged so far`
        : "";
      return `Scanning ${total}${chunks}${flagged}${excludedNote}...`;
    }
    case "analyzing": {
      if (
        progress.candidateCount &&
        progress.contactTotal &&
        progress.candidateCount < progress.contactTotal
      ) {
        return `Analyzing ${progress.candidateCount} flagged candidates (${scannedTotal(progress.contactTotal)} were scanned${excludedNote})...`;
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
    startAdminAiQuestion,
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
  // Set once the start action resolves with a "running" placeholder (the
  // analysis keeps going in the background via Next's `after()`); cleared
  // once the completion poll below observes a terminal status. `progressId`
  // is captured here so the stage-progress poll keeps watching the SAME row
  // the continuation reports under — see the rotation guard further down.
  const [awaiting, setAwaiting] = useState<Awaiting | null>(null);
  const [stalled, setStalled] = useState(false);
  const isUnavailable = !providerAvailability.isConfigured;
  const disabled = isPending || Boolean(awaiting) || isUnavailable;
  const unavailableReason =
    providerAvailability.unavailableReason ?? "Admin AI is not configured yet.";
  const activePollId = awaiting?.progressId ?? progressId;
  const progress =
    (isPending || awaiting) && polled?.id === activePollId ? polled.snapshot : null;

  // Poll GET /api/admin-ai/progress while pending AND while awaiting the
  // background continuation. Two independent things ride this one poll:
  // the stage snapshot (global scope only, exactly as before) and — new —
  // the placeholder message's completion status (both scopes: a contact-scope
  // ask can time out on Hostinger just as easily as a global one). Polling
  // MUST go through a plain GET route, not a server action — React serializes
  // server actions per client, so an action-based poll queues behind the
  // pending ask/continuation and never runs until it resolves.
  useEffect(() => {
    if (!isPending && !awaiting) return;
    const pollProgressId = awaiting?.progressId ?? progressId;
    const pollMessageId = awaiting?.messageId ?? null;
    const pollThreadId = awaiting?.threadId ?? null;
    const pollStartedAt = awaiting?.startedAt ?? null;
    let active = true;
    const interval = setInterval(() => {
      const params = new URLSearchParams({ id: pollProgressId });
      if (pollMessageId) params.set("messageId", pollMessageId);
      fetch(`/api/admin-ai/progress?${params.toString()}`, {
        cache: "no-store",
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<{
            snapshot: AdminAiProgressSnapshot | null;
            assistantMessage?: { id: string; status: AdminAiMessageStatus } | null;
          }>;
        })
        .then(({ snapshot, assistantMessage }) => {
          if (!active) return;
          if (scope === "global" && snapshot) {
            setPolled({ id: pollProgressId, snapshot });
          }
          if (!pollMessageId || !pollThreadId || pollStartedAt === null) return;
          if (assistantMessage && assistantMessage.status !== "running") {
            const finalStatus = assistantMessage.status;
            startTransition(async () => {
              try {
                const detail = await loadAdminAiThread(pollThreadId);
                onResolved({
                  errors: null,
                  message: null,
                  success: finalStatus === "complete",
                  thread: detail.thread,
                  messages: detail.messages,
                });
              } finally {
                setAwaiting(null);
                setStalled(false);
                setProgressId(crypto.randomUUID());
              }
            });
          } else if (Date.now() - pollStartedAt > AWAITING_STALL_MS) {
            setStalled(true);
            setAwaiting(null);
          }
        })
        .catch((error) => {
          console.warn("Admin AI progress poll failed", error);
        });
    }, PROGRESS_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [awaiting, isPending, onResolved, progressId, scope]);

  const resolvedSignature =
    state.thread && state.messages
      ? [
          state.thread.id,
          state.messages.length,
          state.success ? "success" : "failed",
          state.message ?? "",
        ].join(":")
      : null;
  const lastMessage = state.messages?.at(-1) ?? null;
  // A "start" resolution hands back a running placeholder as the last
  // message — the analysis isn't done, it's still running in the background.
  const isStartResolution = state.success && lastMessage?.status === "running";

  // Render-time state adjustment (not an effect): rotate the progress id once
  // per resolved ask so the next submission polls a fresh row. Skipped for a
  // "start" resolution — that ask isn't finished, and rotating now would
  // orphan the progressId the background continuation is still reporting
  // stage updates under (the awaiting-entry effect below rotates it later,
  // once the completion poll actually observes a terminal status).
  const [rotatedFor, setRotatedFor] = useState<string | null>(null);
  if (resolvedSignature && rotatedFor !== resolvedSignature && !isStartResolution) {
    setRotatedFor(resolvedSignature);
    setProgressId(crypto.randomUUID());
  }

  useEffect(() => {
    if (!resolvedSignature) return;
    if (handledRef.current === resolvedSignature) return;
    handledRef.current = resolvedSignature;
    onResolved(state);
    if (isStartResolution && state.thread && lastMessage) {
      setAwaiting({
        threadId: state.thread.id,
        messageId: lastMessage.id,
        progressId,
        startedAt: Date.now(),
      });
      setStalled(false);
    }
  }, [isStartResolution, lastMessage, onResolved, progressId, resolvedSignature, state]);

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
      {(isPending || awaiting) && (
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
      {stalled && (
        <p className={cn("mt-2 text-sm text-destructive", isHero && "text-center")}>
          Still running after 8 minutes — the server may have restarted.
          Reopen the thread from Past questions in a bit; if it never
          completes, re-ask.
        </p>
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
          {isPending || awaiting ? (
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

          {feedback}
        </div>
      </section>
    </form>
  );
}
