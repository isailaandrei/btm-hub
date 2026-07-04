"use client";

import type { AdminAiMessageSummary, AdminAiResponse } from "@/types/admin-ai";
import { CitationList } from "./citation-list";

function buildContactNameMap(
  response: AdminAiResponse | null,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!response) return map;
  for (const entry of response.shortlist ?? []) {
    if (entry.contactId && entry.contactName) {
      map.set(entry.contactId, entry.contactName);
    }
  }
  return map;
}

function renderList(items: string[]) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

export function AnswerView({
  message,
}: {
  message: AdminAiMessageSummary;
}) {
  const response = message.response;
  if (!response) {
    return <p className="text-sm text-foreground">{message.content}</p>;
  }

  const additionalMatches = response.additionalMatches ?? [];
  const assumptions = response.assumptions ?? [];

  return (
    <div className="space-y-4">
      {assumptions.length > 0 && (
        <section className="rounded-md border border-border bg-muted/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Assumptions made
          </p>
          {renderList(assumptions)}
          <p className="mt-2 text-xs text-muted-foreground">
            Not what you meant? Rephrase your question with more specifics.
          </p>
        </section>
      )}

      {response.shortlist && response.shortlist.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Shortlist
          </p>
          {response.shortlist.map((entry, index) => (
            <div
              key={entry.contactId}
              className="rounded-md border border-border bg-background p-3"
            >
              <p className="flex items-baseline justify-between gap-2 text-sm font-medium text-foreground">
                <span>
                  <span className="text-muted-foreground">{index + 1}.</span>{" "}
                  {entry.contactName}
                </span>
                {typeof entry.matchStrength === "number" && (
                  <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                    match {entry.matchStrength}
                  </span>
                )}
              </p>
              {entry.whyFit.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Why fit</p>
                  {renderList(entry.whyFit)}
                </div>
              )}
              {entry.concerns.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Concerns</p>
                  {renderList(entry.concerns)}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {additionalMatches.length > 0 && (
        <details className="rounded-md border border-border bg-background">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
            Show {additionalMatches.length} more{" "}
            {additionalMatches.length === 1 ? "match" : "matches"}
          </summary>
          <ul className="space-y-2 border-t border-border px-3 py-2 text-sm text-foreground">
            {additionalMatches.map((match) => (
              <li key={match.contactId}>
                <span className="font-medium">{match.contactName}</span>
                <span className="text-muted-foreground"> — {match.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {response.contactAssessment && (
        <section className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Contact Assessment
          </p>
          {response.contactAssessment.inferredQualities.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Inferred qualities</p>
              {renderList(response.contactAssessment.inferredQualities)}
            </div>
          )}
          {response.contactAssessment.concerns.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Concerns</p>
              {renderList(response.contactAssessment.concerns)}
            </div>
          )}
        </section>
      )}

      {response.uncertainty.length > 0 && (
        <section>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Uncertainty
          </p>
          {renderList(response.uncertainty)}
        </section>
      )}

      <CitationList
        citations={message.citations}
        contactNameById={buildContactNameMap(response)}
      />
    </div>
  );
}
