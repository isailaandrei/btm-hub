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

  return (
    <div className="space-y-4">
      {response.shortlist && response.shortlist.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Shortlist
          </p>
          {response.shortlist.map((entry) => (
            <div
              key={entry.contactId}
              className="rounded-md border border-border bg-background p-3"
            >
              <p className="text-sm font-medium text-foreground">
                {entry.contactName}
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
