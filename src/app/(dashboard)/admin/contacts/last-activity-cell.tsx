"use client";

import { formatRelative } from "@/lib/format-relative";
import type { ContactActivityDerivation } from "./events-derivation";

interface LastActivityCellProps {
  derivation: ContactActivityDerivation;
}

export function LastActivityCell({ derivation }: LastActivityCellProps) {
  const { last_activity_at, last_activity_label, awaiting_applicant, awaiting_btm } =
    derivation;

  if (!last_activity_at || !last_activity_label) {
    return <span className="text-muted-foreground">—</span>;
  }

  const pending = awaiting_applicant || awaiting_btm;
  const tooltip =
    awaiting_applicant && awaiting_btm
      ? "Awaiting applicant and we owe a response"
      : awaiting_applicant
        ? "Awaiting applicant"
        : awaiting_btm
          ? "We owe a response"
          : "";

  return (
    <span className="flex items-center gap-1.5">
      {pending && (
        <span
          title={tooltip}
          aria-label={tooltip}
          className="inline-block h-2 w-2 rounded-full bg-amber-500"
        />
      )}
      <span>
        {last_activity_label} &middot; {formatRelative(last_activity_at)}
      </span>
    </span>
  );
}
