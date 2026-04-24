"use client";

import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

export type PendingFilterValue = "awaiting_applicant" | "awaiting_btm";

interface PendingFilterProps {
  value: PendingFilterValue[];
  onChange: (next: PendingFilterValue[]) => void;
}

const OPTIONS: { value: PendingFilterValue; label: string }[] = [
  { value: "awaiting_applicant", label: "Awaiting applicant" },
  { value: "awaiting_btm", label: "We owe response" },
];

export function PendingFilter({ value, onChange }: PendingFilterProps) {
  function toggle(v: PendingFilterValue) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  const activeCount = value.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted ${
            activeCount > 0 ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          Pending
          {activeCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-100 px-1 text-[10px] font-medium text-amber-900">
              {activeCount}
            </span>
          )}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
          >
            <Checkbox
              checked={value.includes(o.value)}
              onCheckedChange={() => toggle(o.value)}
            />
            <span className="text-xs">{o.label}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
