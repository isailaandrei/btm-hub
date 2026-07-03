"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import type { ApplicationStatus } from "@/types/database";
import { changeStatus } from "../actions";
import { STATUSES } from "../constants";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface StatusSelectorProps {
  applicationId: string;
  currentStatus: ApplicationStatus;
  currentUpdatedAt: string;
  /**
   * Called after the server confirms a change, with the new status and the new
   * concurrency token. The parent commits its own copy so the optimistic value
   * hands off to a matching base (no revert flicker) and the next change sends a
   * fresh `updated_at`.
   */
  onStatusCommitted?: (status: ApplicationStatus, updatedAt: string) => void;
}

export function StatusSelector({
  applicationId,
  currentStatus,
  currentUpdatedAt,
  onStatusCommitted,
}: StatusSelectorProps) {
  const [isPending, startTransition] = useTransition();
  // Optimistic value layered over the committed prop: the select shows the new
  // status instantly and reverts automatically if the transition ends without a
  // matching commit (the error path below skips the commit).
  const [optimisticStatus, showOptimisticStatus] = useOptimistic(currentStatus);

  function handleChange(next: string) {
    const status = next as ApplicationStatus;
    startTransition(async () => {
      showOptimisticStatus(status);
      try {
        const result = await changeStatus(applicationId, status, currentUpdatedAt);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        onStatusCommitted?.(status, result.updatedAt);
      } catch {
        toast.error("Failed to update status. Please try again.");
      }
    });
  }

  return (
    <Select
      value={optimisticStatus}
      onValueChange={handleChange}
      disabled={isPending}
    >
      <SelectTrigger className="w-full capitalize">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
