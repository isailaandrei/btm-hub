"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { formatRelative } from "@/lib/format-relative";
import { loadContactWhatsAppMessages } from "../actions";

type ConversationMessage = Awaited<
  ReturnType<typeof loadContactWhatsAppMessages>
>[number];

const REALTIME_DEBOUNCE_MS = 150;

/**
 * WhatsApp thread for the contact detail panel. Mirrors `ContactEmailSection`:
 * lazy-loads its own data via a server action with a skeleton and error+retry
 * (the session-cache panel doesn't carry it). Adds a Supabase Realtime channel
 * filtered on `contact_id` so new inbound messages — which the webhook matches
 * on arrival, since the contact exists — live-append without touching the
 * framework Router Cache.
 */
export function ContactWhatsAppSection({ contactId }: { contactId: string }) {
  const [messages, setMessages] = useState<ConversationMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(() => {
    startTransition(async () => {
      try {
        setLoadError(null);
        setMessages(await loadContactWhatsAppMessages(contactId));
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load WhatsApp messages.",
        );
      }
    });
  }, [contactId]);

  useEffect(() => {
    if (messages || isPending || loadError) return;
    loadData();
  }, [messages, isPending, loadData, loadError]);

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
            if (active) setMessages(next);
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
  }, [contactId]);

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
        ) : messages ? (
          messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No WhatsApp messages yet.
            </p>
          ) : (
            <ol className="flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </ol>
          )
        ) : (
          <div className="flex flex-col gap-2">
            <div className="h-10 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-10 w-2/3 animate-pulse self-end rounded bg-muted" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isInbound = message.direction === "inbound";
  return (
    <li className={`flex flex-col ${isInbound ? "items-start" : "items-end"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isInbound
            ? "bg-muted text-foreground"
            : "bg-primary text-primary-foreground"
        }`}
      >
        {message.body ? (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        ) : null}
        {message.media.map((item, index) => (
          <a
            key={`${message.id}-media-${index}`}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block text-xs underline underline-offset-2"
          >
            {item.contentType ?? "Attachment"}
          </a>
        ))}
        {!message.body && message.media.length === 0 ? (
          <p className="italic opacity-70">[no content]</p>
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
