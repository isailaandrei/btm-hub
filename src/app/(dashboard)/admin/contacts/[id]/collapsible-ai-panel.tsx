"use client";

import { useState } from "react";
import type { AdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import type { AdminAiThreadSummary } from "@/types/admin-ai";
import { Card, CardContent } from "@/components/ui/card";
import { AdminAiPanel } from "../../admin-ai/panel";

interface CollapsibleAiPanelProps {
  contactId: string;
  contactName: string;
  initialThreads: AdminAiThreadSummary[];
  providerAvailability: AdminAiProviderAvailability;
}

export function CollapsibleAiPanel({
  contactId,
  contactName,
  initialThreads,
  providerAvailability,
}: CollapsibleAiPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="mt-8">
      <CardContent className="py-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={open}
        >
          <span className="text-sm font-medium text-muted-foreground">
            AI Analyst
          </span>
          <span className="text-xs text-muted-foreground">
            {open ? "Collapse ⌃" : "Expand ⌄"}
          </span>
        </button>
        {open && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Each question runs a fresh grounded search. Past questions below
              are a log — they are not used as context.
            </p>
            <AdminAiPanel
              scope="contact"
              contactId={contactId}
              contactName={contactName}
              initialThreads={initialThreads}
              providerAvailability={providerAvailability}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
