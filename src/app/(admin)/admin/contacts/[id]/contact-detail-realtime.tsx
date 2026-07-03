"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { refreshContactDetailAfterMutation } from "./contact-detail-loader";

const REFRESH_DEBOUNCE_MS = 120;

/**
 * Keeps the open contact's cached bootstrap fresh via Supabase Realtime.
 *
 * On any change to the contact / its applications / its events, it debounces a
 * reload and writes the result into the session cache (the subscribed panel
 * re-renders via `useSyncExternalStore`) — no `router.refresh()`, so it does
 * not depend on the framework Router Cache. Tag changes are intentionally not
 * watched here: tags render from `AdminDataProvider`, which owns those channels.
 */
export function ContactDetailRealtime({ contactId }: { contactId: string }) {
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    const supabase = createClient();

    function scheduleReload() {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        // Mark stale + force a fresh reload so a realtime change is never
        // satisfied by a pre-change in-flight fetch. Best-effort:
        // refreshContactDetailAfterMutation logs its own errors and never
        // rejects, and the stale flag drives the panel's own reload.
        void refreshContactDetailAfterMutation(contactId);
      }, REFRESH_DEBOUNCE_MS);
    }

    const channels: RealtimeChannel[] = [
      supabase
        .channel(`contact-detail-contact-${contactId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "contacts",
            filter: `id=eq.${contactId}`,
          },
          scheduleReload,
        )
        .subscribe(),
      supabase
        .channel(`contact-detail-applications-${contactId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "applications",
            filter: `contact_id=eq.${contactId}`,
          },
          scheduleReload,
        )
        .subscribe(),
      supabase
        .channel(`contact-detail-contact-events-${contactId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "contact_events",
            filter: `contact_id=eq.${contactId}`,
          },
          scheduleReload,
        )
        .subscribe(),
    ];

    return () => {
      clearTimeout(refreshTimeoutRef.current);
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [contactId]);

  return null;
}
