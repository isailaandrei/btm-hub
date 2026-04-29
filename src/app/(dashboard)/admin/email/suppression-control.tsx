"use client";

import { useState, useTransition } from "react";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import type { EmailSuppressionReason } from "@/types/database";
import { suppressContactEmailAction } from "./actions";

interface SuppressionControlProps {
  contactId: string;
  email: string;
}

export function SuppressionControl({ contactId, email }: SuppressionControlProps) {
  const [reason, setReason] = useState<EmailSuppressionReason>("manual");
  const [detail, setDetail] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSuppress() {
    startTransition(async () => {
      try {
        await suppressContactEmailAction({
          contactId,
          email,
          reason,
          detail,
        });
        toast.success("Contact suppressed from all email.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to suppress contact.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Suppression reason</span>
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value as EmailSuppressionReason)}
          className="rounded-md border border-border bg-background px-3 py-2"
        >
          <option value="manual">Manual</option>
          <option value="do_not_contact">Do not contact</option>
          <option value="invalid_address">Invalid address</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Detail</span>
        <textarea
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          rows={3}
          className="rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <button
        type="button"
        onClick={handleSuppress}
        disabled={isPending}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-destructive/60 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
      >
        <Ban className="h-4 w-4" />
        {isPending ? "Suppressing..." : "Suppress all email"}
      </button>
    </div>
  );
}
