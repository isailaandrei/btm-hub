"use client";

import type { AdminAiCitationRow } from "@/types/admin-ai";

function shortenId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function groupByContact(
  citations: AdminAiCitationRow[],
): Array<{ contactId: string; rows: AdminAiCitationRow[] }> {
  // Dedupe on (contactId, source_type, source_id) before grouping so that
  // rows persisted under different claim_keys but pointing at the same
  // chunk render as a single entry. Defense for legacy rows written
  // before the server-side dedupe landed; first-seen row wins.
  const seenSources = new Set<string>();
  const unique: AdminAiCitationRow[] = [];
  for (const citation of citations) {
    const key = `${citation.contact_id}:${citation.source_type}:${citation.source_id}`;
    if (seenSources.has(key)) continue;
    seenSources.add(key);
    unique.push(citation);
  }

  const order: string[] = [];
  const buckets = new Map<string, AdminAiCitationRow[]>();
  for (const citation of unique) {
    const existing = buckets.get(citation.contact_id);
    if (existing) {
      existing.push(citation);
    } else {
      buckets.set(citation.contact_id, [citation]);
      order.push(citation.contact_id);
    }
  }
  return order.map((contactId) => ({
    contactId,
    rows: buckets.get(contactId)!,
  }));
}

export function CitationList({
  citations,
  contactNameById,
}: {
  citations: AdminAiCitationRow[];
  /**
   * Map of contact_id → display name. Populated by the parent from the
   * assistant response (shortlist entries / contact assessment). Any
   * contact_id not in this map falls back to a short UUID label.
   */
  contactNameById?: Map<string, string>;
}) {
  if (citations.length === 0) return null;

  const groups = groupByContact(citations);

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Evidence
      </p>
      {groups.map(({ contactId, rows }) => {
        const name = contactNameById?.get(contactId);
        const label = name ?? `Contact ${shortenId(contactId)}`;
        return (
          <div key={contactId} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">
                {rows.length} {rows.length === 1 ? "citation" : "citations"}
              </p>
            </div>
            <div className="space-y-2">
              {rows.map((citation) => (
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
          </div>
        );
      })}
    </div>
  );
}
