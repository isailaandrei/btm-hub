"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import type { FieldRegistryEntry } from "./field-registry";

interface ColumnFilterPopoverProps {
  field: FieldRegistryEntry;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}

export function ColumnFilterPopover({
  field,
  options,
  selected,
  onToggle,
  onClear,
}: ColumnFilterPopoverProps) {
  const hasActive = selected.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`ml-1 inline-flex items-center gap-0.5 rounded p-0.5 text-xs transition-colors ${
            hasActive
              ? "text-primary"
              : "text-muted-foreground/50 hover:text-muted-foreground"
          }`}
          aria-label={`Filter by ${field.label}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          {hasActive && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {selected.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="max-h-56 overflow-y-auto p-2">
          {options.map((option) => {
            const checked = selected.includes(option);
            return (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
              >
                <Checkbox checked={checked} onCheckedChange={() => onToggle(option)} />
                <span className="text-sm text-foreground">{option}</span>
              </label>
            );
          })}
        </div>
        {hasActive && (
          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={onClear}
              className="w-full rounded-md px-2 py-1 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Clear filter
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
