"use client";

import { useState, useTransition } from "react";
import { Ban, MailCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import type { EmailSuppressionReason } from "@/types/database";
import { formatSuppressionReason } from "@/lib/email/suppression-reason";
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
}: {
  contactId: string;
  excluded: boolean;
  reason: EmailSuppressionReason | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmingAllow, setConfirmingAllow] = useState(false);

  function handleExclude() {
    startTransition(async () => {
      try {
        await excludeContactFromEmail(contactId);
        toast.success("Contact excluded from all email.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to exclude contact.",
        );
      }
    });
  }

  function handleAllow() {
    setConfirmingAllow(false);
    startTransition(async () => {
      try {
        await allowContactEmail(contactId);
        toast.success("Contact can receive email again.");
      } catch (error) {
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
