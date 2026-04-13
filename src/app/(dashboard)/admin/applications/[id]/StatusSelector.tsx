"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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
}

export function StatusSelector({
  applicationId,
  currentStatus,
  currentUpdatedAt,
}: StatusSelectorProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(status: string) {
    startTransition(async () => {
      try {
        const result = await changeStatus(
          applicationId,
          status,
          currentUpdatedAt,
        );
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        router.refresh();
      } catch {
        toast.error("Failed to update status. Please try again.");
      }
    });
  }

  return (
    <Select value={currentStatus} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-full">
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
