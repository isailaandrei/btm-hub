"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Clock, EyeOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import { formatRelative } from "@/lib/format-relative";
import {
  computeThreadAiVisibility,
  type MessageAiVisibility,
} from "@/lib/conversations/ai-visibility";
import {
  deactivateContactWhatsAppMessage,
  loadContactWhatsAppMessages,
  restoreContactWhatsAppMessage,
  type ContactAiMemoryData,
} from "../actions";
import { loadContactAiMemoryShared } from "./contact-ai-memory-loader";

type ConversationMessage = Awaited<
  ReturnType<typeof loadContactWhatsAppMessages>
>[number];

const REALTIME_DEBOUNCE_MS = 150;

/**
 * WhatsApp thread for the contact detail panel. Mirrors `ContactEmailSection`:
 * lazy-loads its own data via a server action with a skeleton and error+retry.
 * A Supabase Realtime channel filtered on `contact_id` live-appends new inbound
 * messages. The owner can soft-remove irrelevant messages (excluding them from
 * the thread and the admin-AI knowledge base); removed messages collapse into a
 * restorable "Removed" area.
 */
export function ContactWhatsAppSection({
  contactId,
  initialMessages = null,
  revalidateInitialData = false,
  onMessagesLoaded,
}: {
  contactId: string;
  /** Server-seeded or session-cached thread; null → lazy-load. */
  initialMessages?: ConversationMessage[] | null;
  /** True when `initialMessages` is session-cached rather than a fresh seed. */
  revalidateInitialData?: boolean;
  /** Session-cache write-back — called with every successfully loaded thread. */
  onMessagesLoaded?: (messages: ConversationMessage[]) => void;
}) {
  const [messages, setMessages] = useState<ConversationMessage[] | null>(
    initialMessages,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isMutating, startMutation] = useTransition();
  const [showRemoved, setShowRemoved] = useState(false);
  // AI-visibility calibration data (digest windows + freshness horizon).
  // Progressive enhancement: the thread renders without it; a load failure is
  // DISCLOSED in the header (never silently badge-less). `nowMs` is captured
  // at load time (render must stay pure) — fresh enough for a 45-day horizon.
  const [aiMemory, setAiMemory] = useState<
    (ContactAiMemoryData & { nowMs: number }) | null
  >(null);
  const [aiMemoryFailed, setAiMemoryFailed] = useState(false);

  useEffect(() => {
    let active = true;
    loadContactAiMemoryShared(contactId)
      .then((data) => {
        if (active) setAiMemory({ ...data, nowMs: Date.now() });
      })
      .catch((error) => {
        console.warn(`AI visibility load failed for contact ${contactId}`, error);
        if (active) setAiMemoryFailed(true);
      });
    return () => {
      active = false;
    };
  }, [contactId]);

  const applyMessages = useCallback(
    (next: ConversationMessage[]) => {
      setMessages(next);
      onMessagesLoaded?.(next);
    },
    [onMessagesLoaded],
  );

  const loadData = useCallback(() => {
    startTransition(async () => {
      try {
        setLoadError(null);
        applyMessages(await loadContactWhatsAppMessages(contactId));
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load WhatsApp messages.",
        );
      }
    });
  }, [applyMessages, contactId]);

  useEffect(() => {
    if (messages || isPending || loadError) return;
    loadData();
  }, [messages, isPending, loadData, loadError]);

  // Stale-while-revalidate for cached initial data: messages that arrived
  // while this contact wasn't on screen aren't covered by the mounted realtime
  // channel below, so reconcile once in the background.
  const revalidatedRef = useRef(false);
  useEffect(() => {
    if (!revalidateInitialData || !initialMessages || revalidatedRef.current) {
      return;
    }
    revalidatedRef.current = true;
    loadData();
  }, [initialMessages, loadData, revalidateInitialData]);

  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    let active = true;
    const supabase = createClient();

    function scheduleReload() {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        void loadContactWhatsAppMessages(contactId)
          .then((next) => {
            if (active) applyMessages(next);
          })
          .catch((error) => {
            console.error(
              `Failed to refresh WhatsApp thread ${contactId} from realtime change`,
              error,
            );
          });
      }, REALTIME_DEBOUNCE_MS);
    }

    const channel: RealtimeChannel = supabase
      .channel(`contact-whatsapp-${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_messages",
          filter: `contact_id=eq.${contactId}`,
        },
        scheduleReload,
      )
      .subscribe();

    return () => {
      active = false;
      clearTimeout(refreshTimeoutRef.current);
      void supabase.removeChannel(channel);
    };
  }, [applyMessages, contactId]);

  // Curation is optimistic: the active/removed groups are derived from
  // `deactivatedAt`, so patching it locally moves the message instantly. It then
  // re-reads on success to land the authoritative row, or rolls back to the
  // exact prior thread and surfaces the error on failure.
  const runMutation = useCallback(
    (messageId: string, deactivate: boolean, mutation: () => Promise<void>) => {
      let previous: ConversationMessage[] | null = null;
      const nowIso = new Date().toISOString();
      setMessages((current) => {
        previous = current;
        if (!current) return current;
        return current.map((message) =>
          message.id === messageId
            ? { ...message, deactivatedAt: deactivate ? nowIso : null }
            : message,
        );
      });
      startMutation(async () => {
        try {
          await mutation();
          applyMessages(await loadContactWhatsAppMessages(contactId));
        } catch (error) {
          setMessages(previous);
          console.error(
            `WhatsApp message curation failed for contact ${contactId}`,
            error,
          );
          toast.error("Couldn't update the message. Please try again.");
        }
      });
    },
    [applyMessages, contactId],
  );

  const { active, removed } = useMemo(() => {
    // Contentless rows (no body, no media — YCloud `errors`-type history
    // entries ingested before Jul 10 2026; new ones are skipped at ingestion)
    // render as empty bubbles and can't carry signal — hide them entirely.
    const all = (messages ?? []).filter(
      (message) => message.body.trim() !== "" || message.media.length > 0,
    );
    return {
      active: all.filter((message) => !message.deactivatedAt),
      removed: all.filter((message) => message.deactivatedAt),
    };
  }, [messages]);

  const aiStates = useMemo(() => {
    if (!aiMemory || !messages) return null;
    return computeThreadAiVisibility({
      messages,
      digests: aiMemory.digests,
      freshnessDays: aiMemory.freshnessDays,
      nowMs: aiMemory.nowMs,
    });
  }, [aiMemory, messages]);

  return (
    <TooltipProvider delayDuration={200}>
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm text-muted-foreground">WhatsApp</CardTitle>
          {aiMemoryFailed ? (
            <span className="text-[11px] text-muted-foreground">
              AI visibility unavailable
            </span>
          ) : aiStates ? (
            <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 fill-primary text-primary" /> profile
              </span>
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" /> status
              </span>
              <span className="flex items-center gap-1">
                <EyeOff className="h-3 w-3 opacity-50" /> noise
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 opacity-50" /> pending
              </span>
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-destructive">{loadError}</p>
            <button
              type="button"
              onClick={loadData}
              disabled={isPending}
              className="w-fit rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
            >
              {isPending ? "Retrying..." : "Retry"}
            </button>
          </div>
        ) : messages === null ? (
          <div className="flex flex-col gap-2">
            <div className="h-10 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-10 w-2/3 animate-pulse self-end rounded bg-muted" />
          </div>
        ) : active.length === 0 && removed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No WhatsApp messages yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All messages removed.
              </p>
            ) : (
              <ol className="flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
                {active.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    aiVisibility={aiStates?.get(message.id) ?? null}
                    disabled={isMutating}
                    action={{
                      label: "Remove",
                      onClick: () =>
                        runMutation(message.id, true, () =>
                          deactivateContactWhatsAppMessage(message.id),
                        ),
                    }}
                  />
                ))}
              </ol>
            )}

            {removed.length > 0 ? (
              <div className="border-t border-border pt-2">
                <button
                  type="button"
                  onClick={() => setShowRemoved((value) => !value)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {showRemoved ? "Hide" : "Show"} removed ({removed.length})
                </button>
                {showRemoved ? (
                  <ol className="mt-2 flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
                    {removed.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        aiVisibility={aiStates?.get(message.id) ?? null}
                        muted
                        disabled={isMutating}
                        action={{
                          label: "Restore",
                          onClick: () =>
                            runMutation(message.id, false, () =>
                              restoreContactWhatsAppMessage(message.id),
                            ),
                        }}
                      />
                    ))}
                  </ol>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}

/**
 * Renders one WhatsApp attachment via the admin media proxy (which serves our
 * archived copy when one exists, else fetches YCloud with the API key).
 * Images render inline; audio (voice notes) and video get native players;
 * everything else is a link. If an image can't load — proxy not configured or
 * media expired upstream before archiving (proxy answers 410) — it degrades
 * to a plain "open" link instead of a broken-image icon.
 */
function MediaAttachment({
  messageId,
  index,
  contentType,
}: {
  messageId: string;
  index: number;
  contentType: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const proxySrc = `/api/whatsapp/ycloud/media?messageId=${encodeURIComponent(
    messageId,
  )}&index=${index}`;
  const isImage = (contentType?.startsWith("image/") ?? false) && !imageFailed;
  const isAudio = contentType?.startsWith("audio/") ?? false;
  const isVideo = contentType?.startsWith("video/") ?? false;

  if (isImage) {
    return (
      <a
        href={proxySrc}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proxySrc}
          alt="WhatsApp image attachment"
          loading="lazy"
          onError={() => setImageFailed(true)}
          className="max-h-72 max-w-full rounded-md object-contain"
        />
      </a>
    );
  }

  if (isAudio) {
    return (
      <audio
        controls
        preload="none"
        src={proxySrc}
        // Fixed width, not w-full: the bubble is shrink-to-fit, so a
        // percentage width resolves cyclically to 0px and the player
        // collapses to an empty sliver (Jul 2026 voice-note bug).
        className="mt-1 block h-10 w-72 max-w-full"
      />
    );
  }

  if (isVideo) {
    return (
      <video
        controls
        preload="metadata"
        src={proxySrc}
        className="mt-1 block max-h-72 max-w-full rounded-md"
      />
    );
  }

  return (
    <a
      href={proxySrc}
      target="_blank"
      rel="noreferrer"
      className="mt-1 block text-xs underline underline-offset-2"
    >
      {contentType?.startsWith("image/")
        ? "Image (open)"
        : (contentType ?? "Attachment")}
    </a>
  );
}

/** Tooltip copy per AI-visibility state (badges are the calibration surface). */
function describeAiVisibility(visibility: MessageAiVisibility): string {
  switch (visibility.state) {
    case "profile":
      return "In AI memory permanently (profile signal).";
    case "status-fresh":
      return `In AI memory until ${
        visibility.expiresAt
          ? new Date(visibility.expiresAt).toLocaleDateString()
          : "soon"
      } (status signal).`;
    case "status-aged":
      return `Aged out of AI memory on ${
        visibility.expiresAt
          ? new Date(visibility.expiresAt).toLocaleDateString()
          : "an earlier date"
      }.`;
    case "noise":
      return "Filtered as noise — the AI never sees this exchange.";
    case "pending":
      return "Not yet processed by the AI (picked up by the next digest run).";
    case "excluded":
      // A removed message that was digested BEFORE removal: the earlier
      // digest may still reference it until the next recalibration rebuild.
      return visibility.digestSummary
        ? "Removed from the thread — but an AI digest created before the removal may still reference this exchange (cleared on the next digest recalibration)."
        : "Not shared with the AI (outbound, unmatched, or removed).";
  }
}

function AiVisibilityBadge({
  visibility,
}: {
  visibility: MessageAiVisibility;
}) {
  // Excluded normally gets no marker (outbound bubbles and the Removed group
  // already communicate it) — EXCEPT removed messages that were digested
  // before removal, where the badge honestly discloses that an earlier digest
  // may still reference them.
  if (visibility.state === "excluded" && !visibility.digestSummary) return null;

  const icon =
    visibility.state === "profile" ? (
      <Sparkles className="h-3 w-3 fill-primary text-primary" />
    ) : visibility.state === "status-fresh" ? (
      <Sparkles className="h-3 w-3 text-amber-500" />
    ) : visibility.state === "status-aged" ? (
      <Sparkles className="h-3 w-3 text-muted-foreground/60" />
    ) : visibility.state === "noise" || visibility.state === "excluded" ? (
      <EyeOff className="h-3 w-3 text-muted-foreground/60" />
    ) : (
      <Clock className="h-3 w-3 text-muted-foreground/60" />
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex shrink-0 cursor-default"
          aria-label={`AI visibility: ${visibility.state}`}
        >
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72">
        <p>{describeAiVisibility(visibility)}</p>
        {visibility.digestSummary ? (
          <p className="mt-1 border-t border-border/40 pt-1 italic">
            AI summary: {visibility.digestSummary}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

function MessageBubble({
  message,
  action,
  disabled,
  muted,
  aiVisibility,
}: {
  message: ConversationMessage;
  action?: { label: string; onClick: () => void };
  disabled?: boolean;
  muted?: boolean;
  aiVisibility?: MessageAiVisibility | null;
}) {
  const isInbound = message.direction === "inbound";
  return (
    <li className={`flex flex-col ${isInbound ? "items-start" : "items-end"}`}>
      <div
        className={`flex items-center gap-1.5 ${
          isInbound ? "flex-row" : "flex-row-reverse"
        }`}
      >
        <div
          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
            isInbound
              ? "bg-muted text-foreground"
              : "bg-primary text-primary-foreground"
          } ${muted ? "opacity-60" : ""}`}
        >
          {message.body ? (
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          ) : null}
          {message.media.map((item, index) => (
            <MediaAttachment
              key={`${message.id}-media-${index}`}
              messageId={message.id}
              index={index}
              contentType={item.contentType}
            />
          ))}
          {!message.body && message.media.length === 0 ? (
            <p className="italic opacity-70">[no content]</p>
          ) : null}
        </div>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            disabled={disabled}
            className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
          >
            {action.label}
          </button>
        ) : null}
      </div>
      <span className="mt-1 flex items-center gap-1.5">
        {aiVisibility ? <AiVisibilityBadge visibility={aiVisibility} /> : null}
        <time
          dateTime={message.happenedAt}
          className="text-[11px] text-muted-foreground"
        >
          {formatRelative(message.happenedAt)}
        </time>
      </span>
    </li>
  );
}
