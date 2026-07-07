"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusDigestExpiry } from "@/lib/conversations/ai-visibility";
import { loadContactAiMemory, type ContactAiMemoryData } from "../actions";

/**
 * Read-only calibration surface (task 1b): the AI's conversation memory for
 * this contact — signal digests (what the AI reads instead of raw messages)
 * and current structured facts. Lets admins check that summaries make sense.
 * Mirrors the sibling sections' lazy-load + error/retry convention. No write
 * paths.
 */
export function ContactAiMemorySection({ contactId }: { contactId: string }) {
  // `nowMs` captured at load time (render must stay pure); precise enough for
  // a 45-day freshness horizon.
  const [data, setData] = useState<
    (ContactAiMemoryData & { nowMs: number }) | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(() => {
    startTransition(async () => {
      try {
        setLoadError(null);
        const loaded = await loadContactAiMemory(contactId);
        setData({ ...loaded, nowMs: Date.now() });
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load AI conversation memory.",
        );
      }
    });
  }, [contactId]);

  useEffect(() => {
    if (data || isPending || loadError) return;
    loadData();
  }, [data, isPending, loadData, loadError]);

  const nowMs = data?.nowMs ?? 0;
  const signalDigests = data?.digests.filter((digest) => !digest.isNoise) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">
          AI conversation memory
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-destructive">{loadError}</p>
            <button
              type="button"
              onClick={loadData}
              disabled={isPending}
              className="w-fit rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
            >
              {isPending ? "Retrying..." : "Retry"}
            </button>
          </div>
        ) : data === null ? (
          <div className="flex flex-col gap-2">
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
            <div className="h-10 w-3/4 animate-pulse rounded bg-muted" />
          </div>
        ) : signalDigests.length === 0 && data.facts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No WhatsApp conversation signal yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {signalDigests.length > 0 && (
              <ol className="flex flex-col gap-3">
                {signalDigests.map((digest) => {
                  const isStatus = digest.relevance !== "profile";
                  const expiresAt = isStatus
                    ? statusDigestExpiry(digest.windowEnd, data.freshnessDays)
                    : null;
                  const aged =
                    expiresAt !== null && Date.parse(expiresAt) <= nowMs;
                  return (
                    <li
                      key={digest.id}
                      className={`rounded-md border border-border/60 p-3 ${
                        aged ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>
                          {new Date(digest.windowStart).toLocaleDateString()}
                          {" – "}
                          {new Date(digest.windowEnd).toLocaleString()}
                        </span>
                        <span
                          className={`rounded-full border px-1.5 py-0.5 font-medium ${
                            isStatus
                              ? "border-amber-300 text-amber-700"
                              : "border-primary/40 text-primary"
                          }`}
                        >
                          {isStatus ? "status" : "profile"}
                        </span>
                        {expiresAt ? (
                          <span>
                            {aged
                              ? `no longer visible to AI (aged out ${new Date(expiresAt).toLocaleDateString()})`
                              : `visible to AI until ${new Date(expiresAt).toLocaleDateString()}`}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-sm text-foreground">
                        {digest.summary}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}

            {data.facts.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Extracted facts
                </p>
                <ul className="flex flex-col gap-1.5">
                  {data.facts.map((fact, index) => (
                    <li
                      key={`${fact.fieldKey ?? "fact"}-${index}`}
                      className="flex flex-wrap items-baseline gap-x-2 text-sm"
                    >
                      <span className="font-medium text-foreground">
                        {fact.label ?? fact.fieldKey ?? "Note"}:
                      </span>
                      <span className="text-foreground">{fact.valueText}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {fact.confidence} confidence ·{" "}
                        {new Date(fact.observedAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
