"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusDigestExpiry } from "@/lib/conversations/ai-visibility";
import type { ContactConversationDigest } from "@/lib/data/conversations";
import { correctContactDigestLabel, type ContactAiMemoryData } from "../actions";
import {
  invalidateContactAiMemoryShared,
  loadContactAiMemoryShared,
} from "./contact-ai-memory-loader";

type DigestLabel = "profile" | "status" | "noise";

function effectiveLabelOf(digest: ContactConversationDigest): DigestLabel {
  if (digest.isNoise) return "noise";
  return digest.relevance === "profile" ? "profile" : "status";
}

function modelLabelOf(digest: ContactConversationDigest): DigestLabel {
  if (digest.modelIsNoise) return "noise";
  return digest.modelRelevance === "profile" ? "profile" : "status";
}

/**
 * Calibration surface (task 1b + digest-label feedback): the AI's conversation
 * memory for this contact — signal digests (what the AI reads instead of raw
 * messages) and current structured facts. Admins can correct a digest's label
 * (profile / status / noise) inline; corrections are hash-keyed so they
 * survive recalibration wipes, and every AI read path overlays them via
 * `conversation_digests_effective`. Mirrors the sibling sections' lazy-load +
 * error/retry convention and the WhatsApp section's optimistic+rollback
 * mutation pattern.
 */
export function ContactAiMemorySection({ contactId }: { contactId: string }) {
  // `nowMs` captured at load time (render must stay pure); precise enough for
  // a 45-day freshness horizon.
  const [data, setData] = useState<
    (ContactAiMemoryData & { nowMs: number }) | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isMutating, startMutation] = useTransition();

  const loadData = useCallback(() => {
    startTransition(async () => {
      try {
        setLoadError(null);
        const loaded = await loadContactAiMemoryShared(contactId);
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

  // Optimistic label correction, mirroring the WhatsApp section's runMutation:
  // patch local state immediately, then persist; on failure roll back to the
  // exact prior snapshot and surface the error via toast (fail loud).
  const correctLabel = useCallback(
    (digest: ContactConversationDigest, label: DigestLabel) => {
      let previous: (ContactAiMemoryData & { nowMs: number }) | null = null;
      const nowIso = new Date().toISOString();
      setData((current) => {
        previous = current;
        if (!current) return current;
        return {
          ...current,
          digests: current.digests.map((candidate) =>
            candidate.contentHash === digest.contentHash
              ? {
                  ...candidate,
                  isNoise: label === "noise",
                  relevance: label === "noise" ? null : label,
                  correctedAt: nowIso,
                }
              : candidate,
          ),
        };
      });
      startMutation(async () => {
        try {
          await correctContactDigestLabel({
            contactId,
            contentHash: digest.contentHash,
            label,
            // Always the model's TRUE original (never a previous correction's
            // values) so the calibration dataset's "original" stays honest.
            originalRelevance: digest.modelRelevance,
            originalIsNoise: digest.modelIsNoise,
          });
          // Evict the shared 30s cache so sibling surfaces (WhatsApp badges)
          // refetch the corrected labels instead of the stale snapshot.
          invalidateContactAiMemoryShared(contactId);
        } catch (error) {
          setData(previous);
          console.error(
            `Digest label correction failed for contact ${contactId}`,
            error,
          );
          toast.error("Couldn't save the label correction. Please try again.");
        }
      });
    },
    [contactId],
  );

  const nowMs = data?.nowMs ?? 0;
  // Originally-noise digests carry empty summaries (nothing to review), so
  // they stay hidden — EXCEPT corrected rows, which must remain visible
  // (muted, "corrected to noise") so the correction is auditable and
  // revertible. A correction that vanishes can't be undone.
  const visibleDigests =
    data?.digests.filter(
      (digest) => !digest.isNoise || digest.correctedAt !== null,
    ) ?? [];

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
        ) : visibleDigests.length === 0 &&
          data.facts.length === 0 &&
          !data.aiSummary ? (
          <p className="text-sm text-muted-foreground">
            No WhatsApp conversation signal yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {data.aiSummary && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  AI summary ·{" "}
                  {new Date(data.aiSummary.generatedAt).toLocaleDateString()} ·{" "}
                  {data.aiSummary.model}
                </p>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {data.aiSummary.summary}
                </p>
              </div>
            )}
            {visibleDigests.length > 0 && (
              <ol className="flex flex-col gap-3">
                {visibleDigests.map((digest) => {
                  const label = effectiveLabelOf(digest);
                  const expiresAt =
                    label === "status"
                      ? statusDigestExpiry(digest.windowEnd, data.freshnessDays)
                      : null;
                  const aged =
                    expiresAt !== null && Date.parse(expiresAt) <= nowMs;
                  return (
                    <li
                      key={digest.id}
                      className={`rounded-md border border-border/60 p-3 ${
                        aged || label === "noise" ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>
                          {new Date(digest.windowStart).toLocaleDateString()}
                          {" – "}
                          {new Date(digest.windowEnd).toLocaleString()}
                        </span>
                        <DigestLabelControl
                          digest={digest}
                          disabled={isMutating}
                          onCorrect={(next) => correctLabel(digest, next)}
                        />
                        {label === "noise" ? (
                          <span>filtered — not visible to AI</span>
                        ) : expiresAt ? (
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

const LABEL_CHIP_ACTIVE: Record<DigestLabel, string> = {
  profile: "border-primary/40 text-primary",
  status: "border-amber-300 text-amber-700",
  noise: "border-border text-muted-foreground",
};

/**
 * Inline label corrector: three tiny chips (profile / status / noise). The
 * EFFECTIVE label renders as the active chip; clicking another chip records a
 * correction. When a correction exists the control shows "(corrected)" with
 * the model's original label in the tooltip.
 */
function DigestLabelControl({
  digest,
  disabled,
  onCorrect,
}: {
  digest: ContactConversationDigest;
  disabled: boolean;
  onCorrect: (label: DigestLabel) => void;
}) {
  const effective = effectiveLabelOf(digest);
  const original = modelLabelOf(digest);
  const isCorrected = digest.correctedAt !== null;

  return (
    <span
      className="flex items-center gap-1"
      title={
        isCorrected
          ? `Corrected by an admin — the model originally labeled this "${original}".`
          : undefined
      }
    >
      {(["profile", "status", "noise"] as const).map((label) => {
        const isActive = label === effective;
        return (
          <button
            key={label}
            type="button"
            disabled={disabled || isActive}
            aria-pressed={isActive}
            onClick={() => onCorrect(label)}
            className={`rounded-full border px-1.5 py-0.5 font-medium transition-colors disabled:cursor-default ${
              isActive
                ? LABEL_CHIP_ACTIVE[label]
                : "border-transparent text-muted-foreground/60 hover:border-border hover:text-foreground disabled:opacity-50"
            }`}
          >
            {label}
          </button>
        );
      })}
      {isCorrected ? (
        <span className="text-[10px] italic text-muted-foreground">
          (corrected)
        </span>
      ) : null}
    </span>
  );
}
