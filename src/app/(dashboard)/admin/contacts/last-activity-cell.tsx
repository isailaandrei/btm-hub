"use client";

import type { ContactActivityDerivation } from "./events-derivation";

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diffMs);
  const days = Math.round(abs / 86_400_000);
  if (days === 0) {
    const hours = Math.round(abs / 3_600_000);
    if (hours === 0) return "just now";
    return `${hours}h ago`;
  }
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

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
