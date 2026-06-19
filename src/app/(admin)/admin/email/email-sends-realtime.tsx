"use client";

import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const REFRESH_DEBOUNCE_MS = 250;

/**
 * Live-updates the Sent emails list via Supabase Realtime. Provider webhooks
 * update each recipient's status and the send's denormalized engagement counts
 * (delivered / opened / clicked / failed / unsubscribed), so subscribing to
 * those tables and debouncing a refresh keeps the stats current as events
 * arrive — no page reload. Both tables are in the realtime publication and
 * readable by admins, so the subscription delivers under RLS.
 */
export function EmailSendsRealtime({ onChange }: { onChange: () => void }) {
  useEffect(() => {
    const supabase = createClient();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    function scheduleRefresh() {
      clearTimeout(timeout);
      // Coalesce the burst of per-recipient events a single webhook batch emits
      // into one refresh.
      timeout = setTimeout(() => onChange(), REFRESH_DEBOUNCE_MS);
    }

    const channels: RealtimeChannel[] = [
      supabase
        .channel("email-sends-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "email_sends" },
          scheduleRefresh,
        )
        .subscribe(),
      supabase
        .channel("email-send-recipients-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "email_send_recipients" },
          scheduleRefresh,
        )
        .subscribe(),
    ];

    return () => {
      clearTimeout(timeout);
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [onChange]);

  return null;
}
