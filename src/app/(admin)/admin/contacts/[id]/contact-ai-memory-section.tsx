"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusDigestExpiryParts } from "@/lib/conversations/ai-visibility";
import type { ContactConversationDigest } from "@/lib/data/conversations";
import { correctContactDigest, type ContactAiMemoryData } from "../actions";
import {
  buildDigestCorrectionPayload,
  DigestLabelControl,
  effectiveLabelOf,
  modelLabelOf,
  type DigestCorrectionPayload,
  type DigestLabel,
} from "./digest-label-control";
import {
  invalidateContactAiMemoryShared,
  loadContactAiMemoryShared,
  subscribeContactAiMemory,
} from "./contact-ai-memory-loader";

type MemoryState = ContactAiMemoryData & { nowMs: number };

/**
 * Calibration surface: the AI's conversation memory for this contact — signal
 * digests (what the AI reads instead of raw messages) and current structured
 * facts. Admins can correct a digest's label (profile / status / noise) and, on
 * status digests, the event date that keeps it visible until the trip. Every
 * correction sends the COMPLETE merged state so a label flip never wipes a
 * previously corrected summary/date; corrections are hash-keyed (survive
 * recalibration wipes) and every AI read path overlays them via
 * `conversation_digests_effective`. Mirrors the sibling sections' lazy-load +
 * error/retry convention and the WhatsApp section's optimistic+rollback pattern.
 */
export function ContactAiMemorySection({ contactId }: { contactId: string }) {
  // `nowMs` captured at load time (render must stay pure); precise enough for
  // the freshness horizons.
  const [data, setData] = useState<MemoryState | null>(null);
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

  // Live-refresh when a correction is made anywhere for this contact (this card
  // OR the WhatsApp thread popover): the cache was just evicted, so re-fetching
  // via loadData lands fresh server truth. Unsubscribe on unmount, so a notify
  // after unmount is a no-op.
  useEffect(() => {
    return subscribeContactAiMemory(contactId, loadData);
  }, [contactId, loadData]);

  // Optimistic correction, mirroring the WhatsApp section's runMutation: patch
  // local state immediately with the resulting effective values, then persist;
  // on failure roll back to the exact prior snapshot and surface the error via
  // toast (fail loud). The payload is always the COMPLETE merged state.
  const applyCorrection = useCallback(
    (digest: ContactConversationDigest, payload: DigestCorrectionPayload) => {
      let previous: MemoryState | null = null;
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
                  isNoise: payload.label === "noise",
                  relevance: payload.label === "noise" ? null : payload.label,
                  summary: payload.correctedSummary ?? candidate.modelSummary,
                  eventDate:
                    payload.correctedEventDate ?? candidate.modelEventDate,
                  correctedAt: nowIso,
                }
              : candidate,
          ),
        };
      });
      startMutation(async () => {
        try {
          await correctContactDigest({
            contactId,
            contentHash: digest.contentHash,
            label: payload.label,
            correctedSummary: payload.correctedSummary,
            correctedEventDate: payload.correctedEventDate,
            // Always the model's TRUE original (never a previous correction) so
            // the calibration dataset's "original" stays honest.
            originalRelevance: digest.modelRelevance,
            originalIsNoise: digest.modelIsNoise,
          });
          // Evict the shared 30s cache so sibling surfaces (WhatsApp badges)
          // refetch the corrected labels instead of the stale snapshot.
          invalidateContactAiMemoryShared(contactId);
        } catch (error) {
          setData(previous);
          console.error(
            `Digest correction failed for contact ${contactId}`,
            error,
          );
          toast.error("Couldn't save the correction. Please try again.");
        }
      });
    },
    [contactId],
  );

  const correctLabel = useCallback(
    (digest: ContactConversationDigest, label: DigestLabel) => {
      // Display text = the EFFECTIVE summary/date, so an existing summary or
      // event-date correction is preserved through a label-only flip.
      applyCorrection(
        digest,
        buildDigestCorrectionPayload({
          label,
          summaryText: digest.summary,
          eventDateText: digest.eventDate ?? "",
          modelSummary: digest.modelSummary,
          modelEventDate: digest.modelEventDate,
        }),
      );
    },
    [applyCorrection],
  );

  const correctEventDate = useCallback(
    (digest: ContactConversationDigest, eventDateText: string) => {
      applyCorrection(
        digest,
        buildDigestCorrectionPayload({
          label: effectiveLabelOf(digest),
          summaryText: digest.summary,
          eventDateText,
          modelSummary: digest.modelSummary,
          modelEventDate: digest.modelEventDate,
        }),
      );
    },
    [applyCorrection],
  );

  const nowMs = data?.nowMs ?? 0;
  // Originally-noise digests carry empty summaries (nothing to review), so they
  // stay hidden — EXCEPT corrected rows, which must remain visible (muted,
  // "corrected to noise") so the correction is auditable and revertible.
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
        ) : visibleDigests.length === 0 && data.facts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No WhatsApp conversation signal yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {visibleDigests.length > 0 && (
              <ol className="flex flex-col gap-3">
                {visibleDigests.map((digest) => (
                  <DigestRow
                    key={digest.id}
                    digest={digest}
                    freshnessDays={data.freshnessDays}
                    eventGraceDays={data.eventGraceDays}
                    nowMs={nowMs}
                    disabled={isMutating}
                    onCorrectLabel={(label) => correctLabel(digest, label)}
                    onCorrectEventDate={(value) =>
                      correctEventDate(digest, value)
                    }
                  />
                ))}
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

function DigestRow({
  digest,
  freshnessDays,
  eventGraceDays,
  nowMs,
  disabled,
  onCorrectLabel,
  onCorrectEventDate,
}: {
  digest: ContactConversationDigest;
  freshnessDays: number;
  eventGraceDays: number;
  nowMs: number;
  disabled: boolean;
  onCorrectLabel: (label: DigestLabel) => void;
  onCorrectEventDate: (value: string) => void;
}) {
  const label = effectiveLabelOf(digest);
  const expiry =
    label === "status"
      ? statusDigestExpiryParts(
          digest.windowEnd,
          freshnessDays,
          digest.eventDate,
          eventGraceDays,
        )
      : null;
  const aged = expiry !== null && Date.parse(expiry.expiresAt) <= nowMs;
  const eventSuffix =
    expiry?.eventDriven && digest.eventDate ? ` · event ${digest.eventDate}` : "";

  return (
    <li
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
          value={label}
          disabled={disabled}
          onSelect={onCorrectLabel}
          correctedFromLabel={
            digest.correctedAt !== null ? modelLabelOf(digest) : null
          }
        />
        {label === "noise" ? (
          <span>filtered — not visible to AI</span>
        ) : expiry ? (
          <span>
            {aged
              ? `no longer visible to AI (aged out ${new Date(expiry.expiresAt).toLocaleDateString()})${eventSuffix}`
              : `visible to AI until ${new Date(expiry.expiresAt).toLocaleDateString()}${eventSuffix}`}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm text-foreground">{digest.summary}</p>
      {label === "status" ? (
        <label className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>Event date</span>
          <EventDateInput
            // Re-key on the committed value so an external change (e.g. a
            // correction from the WhatsApp popover on this same digest) resets
            // the draft — a reset-by-key instead of setState-in-useEffect.
            key={digest.eventDate ?? "none"}
            value={digest.eventDate ?? ""}
            disabled={disabled}
            onCommit={onCorrectEventDate}
          />
          {digest.modelEventDate && digest.modelEventDate !== digest.eventDate ? (
            <span>AI suggested {digest.modelEventDate}</span>
          ) : null}
        </label>
      ) : null}
    </li>
  );
}

/**
 * Controlled date input that commits only on blur or Enter — never per
 * keystroke. A native date input fires `change` for each edited segment (typing
 * a year emits "0002-…", "0020-…", "0202-…"), so committing on change would fire
 * several server corrections with bogus intermediate dates. The draft is local;
 * the parent re-keys this component to reset it when the committed value changes
 * from elsewhere.
 */
function EventDateInput({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      type="date"
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        }
      }}
      className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-primary disabled:opacity-50"
    />
  );
}
