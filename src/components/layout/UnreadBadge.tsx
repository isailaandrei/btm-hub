"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UnreadBadgeProps {
  initialCount: number;
  userId: string;
  variant?: "light" | "dark";
}

export function UnreadBadge({ initialCount, userId, variant = "dark" }: UnreadBadgeProps) {
  const [count, setCount] = useState(initialCount);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  // Fetch actual count on mount (initialCount is 0, this corrects it quickly)
  useEffect(() => {
    async function fetchCount() {
      const supabase = getSupabase();
      const { data } = await supabase.rpc("dm_unread_counts", { _user_id: userId });
      if (data) {
        const total = (data as { unread_count: number }[]).reduce((sum, r) => sum + r.unread_count, 0);
        setCount(total);
      }
    }
    fetchCount();
  }, [userId]);

  // Real-time: listen for conversation updates (triggered by new messages)
  // and read receipts. On any change, re-fetch the actual count to stay accurate.
  useEffect(() => {
    const supabase = getSupabase();

    async function refetchCount() {
      const { data } = await supabase.rpc("dm_unread_counts", { _user_id: userId });
      if (data) {
        const total = (data as { unread_count: number }[]).reduce((sum, r) => sum + r.unread_count, 0);
        setCount(total);
      }
    }

    const channel = supabase
      .channel(`dm:unread:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dm_conversations",
        },
        () => refetchCount(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dm_read_receipts",
          filter: `user_id=eq.${userId}`,
        },
        () => refetchCount(),
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const isLight = variant === "light";

  return (
    <Link
      href="/community/messages"
      className="relative inline-flex items-center justify-center rounded-full p-1.5 transition-opacity hover:opacity-75"
      title="Messages"
    >
      <Mail className={`h-5 w-5 ${isLight ? "text-foreground" : "text-white"}`} />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
