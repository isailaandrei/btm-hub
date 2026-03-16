"use client";

import { useTransition } from "react";
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
}

export function StatusSelector({ applicationId, currentStatus }: StatusSelectorProps) {
  const [isPending, startTransition] = useTransition();

  function handleChange(status: string) {
    startTransition(() => changeStatus(applicationId, status as ApplicationStatus));
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
