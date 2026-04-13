"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const REFRESH_DEBOUNCE_MS = 120;

export function ContactDetailRealtimeRefresh({
  contactId,
}: {
  contactId: string;
}) {
  const router = useRouter();
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    const supabase = createClient();

    function scheduleRefresh() {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        router.refresh();
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
          scheduleRefresh,
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
          scheduleRefresh,
        )
        .subscribe(),
      supabase
        .channel(`contact-detail-contact-tags-${contactId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "contact_tags",
            filter: `contact_id=eq.${contactId}`,
          },
          scheduleRefresh,
        )
        .subscribe(),
      supabase
        .channel(`contact-detail-contact-notes-${contactId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "contact_notes",
            filter: `contact_id=eq.${contactId}`,
          },
          scheduleRefresh,
        )
        .subscribe(),
      supabase
        .channel("contact-detail-tag-categories")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tag_categories",
          },
          scheduleRefresh,
        )
        .subscribe(),
      supabase
        .channel("contact-detail-tags")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tags",
          },
          scheduleRefresh,
        )
        .subscribe(),
    ];

    return () => {
      clearTimeout(refreshTimeoutRef.current);
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [contactId, router]);

  return null;
}
