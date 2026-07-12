"use client";

import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ContactConversationDigest } from "@/lib/data/conversations";
import {
  buildDigestCorrectionPayload,
  DigestLabelControl,
  effectiveLabelOf,
  modelLabelOf,
  type DigestCorrectionPayload,
  type DigestLabel,
} from "./digest-label-control";

/**
 * Popover editor for a single conversation digest: relabel (profile / status /
 * noise), rewrite its summary (the noise-rescue path — a code-gated noise
 * window has an empty model summary and this is the only way to give it one),
 * and set the event date that keeps STATUS content visible until the trip. It
 * emits the COMPLETE merged correction state; the parent owns the optimistic
 * mutation + rollback + shared-cache invalidation. The trigger is whatever the
 * parent passes as children (a message badge in the thread, a button in the
 * memory card).
 */
export function DigestCorrectionPopover({
  digest,
  fallbackSummary,
  contextNote,
  disabled,
  onSubmit,
  children,
}: {
  digest: ContactConversationDigest;
  /** Prefill for a summary-less (noise) window — the joined message bodies. */
  fallbackSummary?: string;
  /** Short line shown at the top of the popover (e.g. the message's current
   * AI-visibility state) so the click target loses no context vs. a tooltip. */
  contextNote?: ReactNode;
  disabled?: boolean;
  onSubmit: (payload: DigestCorrectionPayload) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-3">
        {open ? (
          <DigestCorrectionForm
            digest={digest}
            fallbackSummary={fallbackSummary}
            contextNote={contextNote}
            disabled={disabled ?? false}
            onCancel={() => setOpen(false)}
            onSubmit={(payload) => {
              setOpen(false);
              onSubmit(payload);
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function DigestCorrectionForm({
  digest,
  fallbackSummary,
  contextNote,
  disabled,
  onSubmit,
  onCancel,
}: {
  digest: ContactConversationDigest;
  fallbackSummary?: string;
  contextNote?: ReactNode;
  disabled: boolean;
  onSubmit: (payload: DigestCorrectionPayload) => void;
  onCancel: () => void;
}) {
  // Lazy initializers capture the digest's current values at open time; Radix
  // remounts this form on each open so it always reflects the latest state.
  const [label, setLabel] = useState<DigestLabel>(() => effectiveLabelOf(digest));
  const [summaryText, setSummaryText] = useState<string>(() =>
    digest.summary.trim() !== "" ? digest.summary : (fallbackSummary ?? ""),
  );
  const [eventDateText, setEventDateText] = useState<string>(
    () => digest.eventDate ?? "",
  );

  const original = modelLabelOf(digest);
  // A signal label needs a non-empty summary; a code-gated noise window has an
  // empty model summary, so rescuing it REQUIRES text here (server enforces too).
  const summaryRequired = label !== "noise" && digest.modelSummary.trim() === "";
  const summaryMissing = summaryRequired && summaryText.trim() === "";

  return (
    <div className="flex flex-col gap-3 text-sm">
      {contextNote ? (
        <p className="text-[11px] text-muted-foreground">{contextNote}</p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Label
        </span>
        <DigestLabelControl
          value={label}
          disabled={disabled}
          onSelect={setLabel}
          correctedFromLabel={digest.correctedAt !== null ? original : null}
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Summary {label !== "noise" ? "" : "(kept for revert)"}
        </span>
        <textarea
          value={summaryText}
          onChange={(event) => setSummaryText(event.target.value)}
          rows={4}
          maxLength={2000}
          disabled={disabled}
          placeholder="What should the AI remember from this exchange?"
          className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary disabled:opacity-50"
        />
        {summaryMissing ? (
          <span className="text-[11px] text-destructive">
            A profile or status label needs a summary.
          </span>
        ) : null}
      </label>

      {label === "status" ? (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Event date
          </span>
          <input
            type="date"
            value={eventDateText}
            onChange={(event) => setEventDateText(event.target.value)}
            disabled={disabled}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-50"
          />
          {digest.modelEventDate && digest.modelEventDate !== eventDateText ? (
            <span className="text-[11px] text-muted-foreground">
              AI suggested {digest.modelEventDate}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Keeps this in the AI&apos;s view until the event.
            </span>
          )}
        </label>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onSubmit(
              buildDigestCorrectionPayload({
                label,
                summaryText,
                eventDateText,
                modelSummary: digest.modelSummary,
                modelEventDate: digest.modelEventDate,
              }),
            )
          }
          disabled={disabled || summaryMissing}
          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}
