"use client";

import type { AdminAiCitationRow } from "@/types/admin-ai";

export function CitationList({
  citations,
}: {
  citations: AdminAiCitationRow[];
}) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Evidence
      </p>
      {citations.map((citation) => (
        <div
          key={citation.id}
          className="rounded-md border border-border bg-muted/30 p-3"
        >
          <p className="text-xs font-medium text-foreground">
            {citation.source_label}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {citation.snippet}
          </p>
        </div>
      ))}
    </div>
  );
}
