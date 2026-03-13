"use client";

import { useTransition } from "react";
import type { ApplicationStatus } from "@/types/database";
import { changeStatus } from "../actions";
import { STATUSES } from "../constants";

interface StatusSelectorProps {
  applicationId: string;
  currentStatus: ApplicationStatus;
}

export function StatusSelector({ applicationId, currentStatus }: StatusSelectorProps) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const status = e.target.value as ApplicationStatus;
    startTransition(() => changeStatus(applicationId, status));
  }

  return (
    <select
      value={currentStatus}
      onChange={handleChange}
      disabled={isPending}
      className="w-full rounded-lg border border-brand-secondary bg-brand-secondary px-3 py-2 text-sm capitalize text-white outline-none transition-colors focus:border-brand-primary disabled:opacity-50"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s} className="capitalize">
          {s}
        </option>
      ))}
    </select>
  );
}
