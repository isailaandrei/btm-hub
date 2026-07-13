"use client";

import type { ContactConversationDigest } from "@/lib/data/conversations";

export type DigestLabel = "profile" | "status" | "noise";

export function effectiveLabelOf(digest: ContactConversationDigest): DigestLabel {
  if (digest.isNoise) return "noise";
  return digest.relevance === "profile" ? "profile" : "status";
}

export function modelLabelOf(digest: ContactConversationDigest): DigestLabel {
  if (digest.modelIsNoise) return "noise";
  return digest.modelRelevance === "profile" ? "profile" : "status";
}

export type DigestCorrectionPayload = {
  /** null = no label correction (the effective label inherits the model's). A
   * non-null label is recorded as a correction pair with the model's original. */
  label: DigestLabel | null;
  correctedSummary: string | null;
  correctedEventDate: string | null;
  /** Complete desired dismissal state (removed from AI memory or not). Carried
   * through every edit so a label/summary/date change can't silently flip it. */
  dismissed: boolean;
};

/**
 * Builds the COMPLETE correction state to send to `correctContactDigest` from
 * the desired DISPLAY state (label + the summary/date text the admin sees + the
 * dismissal). Every field is diffed against the model's original: an unchanged
 * field yields a null correction (the model's value stays inherited via the
 * effective view) rather than being pinned as a correction, and an existing
 * correction is preserved because the display text already reflects it. This is
 * why a label-only flip never wipes a previously corrected summary/date, and why
 * a summary/date/dismissal edit never records a spurious identity LABEL pair:
 * the LABEL is diffed against `modelLabel`, so an unchanged label sends null.
 * Callers pass the effective (already-corrected) summary/date/label as the
 * display state, and the digest's current dismissal unless they toggle it.
 */
export function buildDigestCorrectionPayload(input: {
  label: DigestLabel;
  /** The model's original label — the LABEL diff baseline (an unchanged label
   * records no pair). */
  modelLabel: DigestLabel;
  summaryText: string;
  eventDateText: string;
  modelSummary: string;
  modelEventDate: string | null;
  dismissed: boolean;
}): DigestCorrectionPayload {
  const label = input.label === input.modelLabel ? null : input.label;
  const trimmed = input.summaryText.trim();
  const correctedSummary =
    trimmed && trimmed !== input.modelSummary.trim() ? trimmed : null;
  const modelDate = input.modelEventDate ?? "";
  const correctedEventDate =
    input.eventDateText && input.eventDateText !== modelDate
      ? input.eventDateText
      : null;
  return { label, correctedSummary, correctedEventDate, dismissed: input.dismissed };
}

/**
 * Reconstructs a digest's EFFECTIVE row after applying a correction payload —
 * the optimistic patch shared by both correction surfaces (the AI-memory card
 * and the WhatsApp thread popover), so their local state matches what the
 * server will return. A label-less payload (`label === null`) leaves the
 * effective label inherited (untouched); summary/event-date fall back to the
 * model's when the payload carries no override; a dismissal keeps an existing
 * dismissed timestamp or stamps `nowIso` for a fresh one.
 */
export function applyPayloadToDigest(
  digest: ContactConversationDigest,
  payload: DigestCorrectionPayload,
  nowIso: string,
): ContactConversationDigest {
  return {
    ...digest,
    isNoise: payload.label !== null ? payload.label === "noise" : digest.isNoise,
    relevance:
      payload.label !== null
        ? payload.label === "noise"
          ? null
          : payload.label
        : digest.relevance,
    summary: payload.correctedSummary ?? digest.modelSummary,
    eventDate: payload.correctedEventDate ?? digest.modelEventDate,
    correctedAt: nowIso,
    dismissedAt: payload.dismissed ? (digest.dismissedAt ?? nowIso) : null,
  };
}

const LABEL_CHIP_ACTIVE: Record<DigestLabel, string> = {
  profile: "border-primary/40 text-primary",
  status: "border-amber-300 text-amber-700",
  noise: "border-border text-muted-foreground",
};

/**
 * Inline three-way label corrector (profile / status / noise) — shared by the
 * AI-memory section and the WhatsApp-thread correction popover. Renders the
 * ACTIVE label as the highlighted, disabled chip; clicking another chip calls
 * `onSelect`. The active chip reflects whatever the parent passes as `value`,
 * so it works both against a digest's effective label and against local
 * editing state in the popover.
 */
export function DigestLabelControl({
  value,
  disabled,
  onSelect,
  correctedFromLabel,
}: {
  value: DigestLabel;
  disabled: boolean;
  onSelect: (label: DigestLabel) => void;
  /** The model's original label when a correction exists — shown in a tooltip. */
  correctedFromLabel?: DigestLabel | null;
}) {
  return (
    <span
      className="flex items-center gap-1"
      title={
        correctedFromLabel
          ? `Corrected by an admin — the model originally labeled this "${correctedFromLabel}".`
          : undefined
      }
    >
      {(["profile", "status", "noise"] as const).map((label) => {
        const isActive = label === value;
        return (
          <button
            key={label}
            type="button"
            disabled={disabled || isActive}
            aria-pressed={isActive}
            onClick={() => onSelect(label)}
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
      {correctedFromLabel ? (
        <span className="text-[10px] italic text-muted-foreground">
          (corrected)
        </span>
      ) : null}
    </span>
  );
}
