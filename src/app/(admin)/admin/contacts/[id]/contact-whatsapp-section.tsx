"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { formatRelative } from "@/lib/format-relative";
import {
  deactivateContactWhatsAppMessage,
  loadContactWhatsAppMessages,
  restoreContactWhatsAppMessage,
} from "../actions";

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

  // Curation runs through its own transition and re-reads on success so the
  // moved message lands in the right group.
  const runMutation = useCallback(
    (mutation: () => Promise<void>) => {
      startMutation(async () => {
        try {
          await mutation();
          applyMessages(await loadContactWhatsAppMessages(contactId));
        } catch (error) {
          console.error(
            `WhatsApp message curation failed for contact ${contactId}`,
            error,
          );
        }
      });
    },
    [applyMessages, contactId],
  );

  const { active, removed } = useMemo(() => {
    const all = messages ?? [];
    return {
      active: all.filter((message) => !message.deactivatedAt),
      removed: all.filter((message) => message.deactivatedAt),
    };
  }, [messages]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">WhatsApp</CardTitle>
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
                    disabled={isMutating}
                    action={{
                      label: "Remove",
                      onClick: () =>
                        runMutation(() =>
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
                        muted
                        disabled={isMutating}
                        action={{
                          label: "Restore",
                          onClick: () =>
                            runMutation(() =>
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
  );
}

/**
 * Renders one WhatsApp attachment. Images are shown inline via the admin media
 * proxy (which adds the YCloud API key); if the image can't load — proxy not
 * configured (no YCLOUD_API_KEY) or media expired by YCloud — it degrades to a
 * plain "open" link instead of a broken-image icon. Non-images are always links.
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

function MessageBubble({
  message,
  action,
  disabled,
  muted,
}: {
  message: ConversationMessage;
  action?: { label: string; onClick: () => void };
  disabled?: boolean;
  muted?: boolean;
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
      <time
        dateTime={message.happenedAt}
        className="mt-1 text-[11px] text-muted-foreground"
      >
        {formatRelative(message.happenedAt)}
      </time>
    </li>
  );
}
