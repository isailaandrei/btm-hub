"use client";

import { Loader2 } from "lucide-react";
import type { ComposeRecipient, ComposeSkippedRecipient } from "../actions";

const SKIP_REASON_LABELS: Record<string, string> = {
  suppressed: "Suppressed",
  newsletter_unsubscribed: "Unsubscribed",
};

export function formatSkipReason(reason: string): string {
  return SKIP_REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

export function RecipientList({
  eligible,
  skipped,
  isLoading,
}: {
  eligible: ComposeRecipient[];
  skipped: ComposeSkippedRecipient[];
  isLoading: boolean;
}) {
  const eligibleCount = eligible.length;

  return (
    <div className="mt-1">
      <p className="flex items-center gap-2 text-sm text-foreground">
        <span>
          {eligibleCount} {eligibleCount === 1 ? "recipient" : "recipients"} will
          receive this email
        </span>
        {isLoading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </p>

      {eligibleCount > 0 && (
        <ul className="mt-2 flex max-h-[220px] flex-col gap-1 overflow-auto pr-1">
          {eligible.map((recipient) => (
            <li
              key={`${recipient.source}:${recipient.email}`}
              className="flex min-w-0 items-center gap-2 text-sm"
            >
              <span className="min-w-0 max-w-[45%] truncate font-medium text-foreground">
                {recipient.name}
              </span>
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {recipient.email}
              </span>
              {recipient.source === "manual" && (
                <span className="ml-auto shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Saved
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {skipped.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-xs font-medium text-amber-700">
            {skipped.length} won&apos;t receive
          </p>
          <ul className="mt-1.5 flex max-h-[160px] flex-col gap-1 overflow-auto pr-1">
            {skipped.map((recipient) => (
              <li
                key={`${recipient.source}:${recipient.email}`}
                className="flex min-w-0 items-center gap-2 text-sm"
              >
                <span className="min-w-0 max-w-[45%] truncate text-muted-foreground line-through">
                  {recipient.name}
                </span>
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {recipient.email}
                </span>
                <span className="ml-auto shrink-0 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700">
                  {formatSkipReason(recipient.reason)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
