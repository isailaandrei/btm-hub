"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  loadGlobalAdminAiPanelData,
  type AdminAiPanelData,
} from "./actions";
import { AdminAiPanel } from "./panel";

export function AdminAiDashboardPanel({ isVisible }: { isVisible: boolean }) {
  const [data, setData] = useState<AdminAiPanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    if (!isVisible || data || hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    startTransition(async () => {
      try {
        setData(await loadGlobalAdminAiPanelData());
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load Admin AI.",
        );
      }
    });
  }, [data, isVisible]);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!data || isPending) {
    return (
      <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading AI agent...
      </div>
    );
  }

  return (
    <AdminAiPanel
      scope="global"
      initialThreads={data.initialThreads}
      providerAvailability={data.providerAvailability}
    />
  );
}
