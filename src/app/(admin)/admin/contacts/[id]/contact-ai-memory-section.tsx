"use client";

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusDigestExpiryParts } from "@/lib/conversations/ai-visibility";
import type { ContactConversationDigest } from "@/lib/data/conversations";
import { correctContactDigest, type ContactAiMemoryData } from "../actions";
import {
  applyPayloadToDigest,
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

/** Which zone a digest belongs in on the memory card (see `classifyMemoryDigest`). */
export type MemoryGroup = "profile" | "status" | "hidden";

/**
 * Buckets a digest into the memory card's three zones. Profile digests are
 * permanently visible; a status digest is visible while fresh OR event-extended,
 * else it falls to the collapsed "not visible to AI" zone. A dismissed digest,
 * or one corrected to noise, is always hidden. Pure so it can be unit-tested and
 * shared between the render and its tests.
 */
export function classifyMemoryDigest(
  digest: ContactConversationDigest,
  freshnessDays: number,
  eventGraceDays: number,
  nowMs: number,
): MemoryGroup {
  if (digest.dismissedAt !== null) return "hidden";
  const label = effectiveLabelOf(digest);
  if (label === "noise") return "hidden";
  if (label === "profile") return "profile";
  const { expiresAt } = statusDigestExpiryParts(
    digest.windowEnd,
    freshnessDays,
    digest.eventDate,
    eventGraceDays,
  );
  return Date.parse(expiresAt) > nowMs ? "status" : "hidden";
}

/**
 * Calibration surface: the AI's conversation memory for this contact, grouped so
 * the card stays calm as status digests accumulate — profile digests (permanent)
 * and live status digests up top, everything the AI no longer sees (aged status,
 * corrected-to-noise, admin-dismissed) folded into a collapsed disclosure below.
 * Admins can correct a digest's label (profile / status / noise), edit the event
 * date that keeps a status digest visible until the trip, and remove a status
 * digest from AI memory early (revertible). Every correction sends the COMPLETE
 * merged state so a label flip never wipes a previously corrected summary/date/
 * dismissal; corrections are hash-keyed (survive recalibration wipes) and every
 * AI read path overlays them via `conversation_digests_effective`. Mirrors the
 * sibling sections' lazy-load + error/retry convention and the WhatsApp section's
 * optimistic+rollback pattern.
 */
export function ContactAiMemorySection({ contactId }: { contactId: string }) {
  // `nowMs` captured at load time (render must stay pure); precise enough for
  // the freshness horizons.
  const [data, setData] = useState<MemoryState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isMutating, startMutation] = useTransition();
  // Disclosure for the "not visible to AI" zone. Default collapsed; local state
  // persists across refetches because the component never remounts on reload.
  const [showHidden, setShowHidden] = useState(false);

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
              ? applyPayloadToDigest(candidate, payload, nowIso)
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
            dismissed: payload.dismissed,
            // Originals accompany a label pair only; a label-less correction
            // sends null (the effective label inherits the model's). Always the
            // model's TRUE original, never a previous correction.
            originalRelevance: payload.label !== null ? digest.modelRelevance : null,
            originalIsNoise: payload.label !== null ? digest.modelIsNoise : null,
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

  // Every edit routes through the payload builder with the model label as the
  // diff baseline (so an unchanged label records no pair) and carries the
  // digest's CURRENT dismissal unless the caller is toggling it.
  const correctLabel = useCallback(
    (digest: ContactConversationDigest, label: DigestLabel) => {
      applyCorrection(
        digest,
        buildDigestCorrectionPayload({
          label,
          modelLabel: modelLabelOf(digest),
          summaryText: digest.summary,
          eventDateText: digest.eventDate ?? "",
          modelSummary: digest.modelSummary,
          modelEventDate: digest.modelEventDate,
          dismissed: digest.dismissedAt !== null,
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
          modelLabel: modelLabelOf(digest),
          summaryText: digest.summary,
          eventDateText,
          modelSummary: digest.modelSummary,
          modelEventDate: digest.modelEventDate,
          dismissed: digest.dismissedAt !== null,
        }),
      );
    },
    [applyCorrection],
  );

  const setDismissed = useCallback(
    (digest: ContactConversationDigest, dismissed: boolean) => {
      applyCorrection(
        digest,
        buildDigestCorrectionPayload({
          label: effectiveLabelOf(digest),
          modelLabel: modelLabelOf(digest),
          summaryText: digest.summary,
          eventDateText: digest.eventDate ?? "",
          modelSummary: digest.modelSummary,
          modelEventDate: digest.modelEventDate,
          dismissed,
        }),
      );
    },
    [applyCorrection],
  );

  const nowMs = data?.nowMs ?? 0;
  const profileDigests: ContactConversationDigest[] = [];
  const statusDigests: ContactConversationDigest[] = [];
  const hiddenDigests: ContactConversationDigest[] = [];
  if (data) {
    for (const digest of data.digests) {
      // Model-noise markers carry empty summaries (nothing to review) and stay
      // hidden entirely — UNLESS an admin corrected one (correctedAt set), which
      // must remain reviewable/revertible in the "not visible to AI" zone.
      if (digest.isNoise && digest.correctedAt === null) continue;
      const group = classifyMemoryDigest(
        digest,
        data.freshnessDays,
        data.eventGraceDays,
        nowMs,
      );
      if (group === "profile") profileDigests.push(digest);
      else if (group === "status") statusDigests.push(digest);
      else hiddenDigests.push(digest);
    }
  }
  const hasDigests =
    profileDigests.length + statusDigests.length + hiddenDigests.length > 0;

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
        ) : !hasDigests && data.facts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No WhatsApp conversation signal yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {profileDigests.length > 0 && (
              <section>
                <GroupLabel>Profile</GroupLabel>
                <ol className="flex flex-col gap-3">
                  {profileDigests.map((digest) => (
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
              </section>
            )}

            {statusDigests.length > 0 && (
              <section>
                <GroupLabel>Status</GroupLabel>
                <ol className="flex flex-col gap-3">
                  {statusDigests.map((digest) => (
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
                      onDismiss={() => setDismissed(digest, true)}
                    />
                  ))}
                </ol>
              </section>
            )}

            {hiddenDigests.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setShowHidden((value) => !value)}
                  aria-expanded={showHidden}
                  className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform ${
                      showHidden ? "rotate-90" : ""
                    }`}
                  />
                  Not visible to AI ({hiddenDigests.length})
                </button>
                {showHidden ? (
                  <ol className="mt-2 flex flex-col gap-3">
                    {hiddenDigests.map((digest) => (
                      <DigestRow
                        key={digest.id}
                        digest={digest}
                        freshnessDays={data.freshnessDays}
                        eventGraceDays={data.eventGraceDays}
                        nowMs={nowMs}
                        disabled={isMutating}
                        muted
                        onCorrectLabel={(label) => correctLabel(digest, label)}
                        onCorrectEventDate={(value) =>
                          correctEventDate(digest, value)
                        }
                        onRestore={
                          digest.dismissedAt !== null
                            ? () => setDismissed(digest, false)
                            : undefined
                        }
                      />
                    ))}
                  </ol>
                ) : null}
              </section>
            )}

            {data.facts.length > 0 && (
              <div>
                <GroupLabel>Extracted facts</GroupLabel>
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

/** Small uppercase zone header, matching the "Extracted facts" convention. */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function DigestRow({
  digest,
  freshnessDays,
  eventGraceDays,
  nowMs,
  disabled,
  muted,
  onCorrectLabel,
  onCorrectEventDate,
  onDismiss,
  onRestore,
}: {
  digest: ContactConversationDigest;
  freshnessDays: number;
  eventGraceDays: number;
  nowMs: number;
  disabled: boolean;
  /** Hidden-zone rows render muted. */
  muted?: boolean;
  onCorrectLabel: (label: DigestLabel) => void;
  onCorrectEventDate: (value: string) => void;
  /** Provided for live status rows — removes the digest from AI memory. */
  onDismiss?: () => void;
  /** Provided for dismissed rows — restores the digest to AI memory. */
  onRestore?: () => void;
}) {
  const label = effectiveLabelOf(digest);
  const dismissed = digest.dismissedAt !== null;
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
    <li className={`rounded-md border border-border/60 p-3 ${muted ? "opacity-60" : ""}`}>
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
        {dismissed ? (
          <span>removed from AI memory</span>
        ) : label === "noise" ? (
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
      {dismissed ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>
            Removed from AI memory{" "}
            {new Date(digest.dismissedAt as string).toLocaleDateString()}
          </span>
          {onRestore ? (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={onRestore}
                disabled={disabled}
                className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
              >
                Restore
              </button>
            </>
          ) : null}
        </div>
      ) : onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          disabled={disabled}
          className="mt-2 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
        >
          Remove from AI memory
        </button>
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
