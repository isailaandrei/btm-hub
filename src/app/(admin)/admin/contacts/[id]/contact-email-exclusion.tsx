"use client";

import { useState, useTransition } from "react";
import { Ban, MailCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import type { EmailSuppressionReason } from "@/types/database";
import { formatSuppressionReason } from "@/lib/email/suppression-reason";
import type { RollbackHandle } from "../../admin-optimistic-mutations";
import {
  allowContactEmail,
  excludeContactFromEmail,
} from "../actions";

/**
 * Per-contact do-not-email control. Shows whether the contact is currently on
 * the exclusion list and why, and lets an admin exclude or (deliberately) allow
 * email again. Un-excluding is a consent action, so it's a single explicit click.
 */
export function ContactEmailExclusion({
  contactId,
  excluded,
  reason,
  onChanged,
  onOptimisticChange,
}: {
  contactId: string;
  excluded: boolean;
  reason: EmailSuppressionReason | null;
  /** Called after a successful toggle so the parent can re-read the status —
   *  the client cache survives revalidatePath, so it won't refresh on its own. */
  onChanged?: () => void;
  /** Flip the parent's rendered status instantly and get a targeted rollback for
   *  the failure path. The success path still reconciles via `onChanged`. */
  onOptimisticChange: (
    excluded: boolean,
    reason: EmailSuppressionReason | null,
  ) => RollbackHandle;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmingAllow, setConfirmingAllow] = useState(false);

  function handleExclude() {
    // Server sets reason "do_not_contact" for a manual exclude — mirror it so the
    // optimistic value matches and the reconcile doesn't flip the reason text.
    const { rollback } = onOptimisticChange(true, "do_not_contact");
    startTransition(async () => {
      try {
        await excludeContactFromEmail(contactId);
        toast.success("Contact excluded from all email.");
        onChanged?.();
      } catch (error) {
        rollback();
        toast.error(
          error instanceof Error ? error.message : "Failed to exclude contact.",
        );
      }
    });
  }

  function handleAllow() {
    setConfirmingAllow(false);
    const { rollback } = onOptimisticChange(false, null);
    startTransition(async () => {
      try {
        await allowContactEmail(contactId);
        toast.success("Contact can receive email again.");
        onChanged?.();
      } catch (error) {
        rollback();
        toast.error(
          error instanceof Error ? error.message : "Failed to update contact.",
        );
      }
    });
  }

  if (excluded) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2 text-sm">
          <ShieldOff className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-foreground">Excluded from all email</p>
            <p className="text-xs text-muted-foreground">
              Reason: {reason ? formatSuppressionReason(reason) : "Excluded"}
            </p>
          </div>
        </div>
        {confirmingAllow ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAllow}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              <MailCheck className="size-3.5" />
              Confirm — allow email
            </button>
            <button
              type="button"
              onClick={() => setConfirmingAllow(false)}
              disabled={isPending}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingAllow(true)}
            disabled={isPending}
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            <MailCheck className="size-3.5" />
            Allow email again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 text-sm">
        <MailCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        <p className="text-muted-foreground">
          This contact can receive email.
        </p>
      </div>
      <button
        type="button"
        onClick={handleExclude}
        disabled={isPending}
        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-destructive/50 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
      >
        <Ban className="size-3.5" />
        Exclude from all email
      </button>
    </div>
  );
}
