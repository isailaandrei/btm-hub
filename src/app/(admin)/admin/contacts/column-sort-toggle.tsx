"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

interface ColumnSortToggleProps {
  active: boolean;
  direction: "asc" | "desc" | null;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}

/**
 * Small 3-state sort toggle button, rendered next to each sortable
 * column header alongside (or in place of) the filter popover trigger.
 * Click cycles: none → asc → desc → none.
 *
 * Visual grammar mirrors `ColumnFilterPopover` so the header icons feel
 * like siblings: same hover/active colors, same size, same padding.
 */
export function ColumnSortToggle({
  active,
  disabled = false,
  direction,
  onClick,
  label,
}: ColumnSortToggleProps) {
  const Icon = !active
    ? ArrowUpDown
    : direction === "asc"
      ? ArrowUp
      : ArrowDown;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`ml-0.5 inline-flex min-h-6 min-w-6 items-center justify-center rounded p-0.5 text-xs transition-colors ${
        active
          ? "text-primary"
          : "text-muted-foreground/50 hover:text-muted-foreground"
      } disabled:cursor-not-allowed disabled:opacity-40`}
      aria-label={`Sort by ${label}${
        active ? ` (${direction}ending, click to ${direction === "asc" ? "reverse" : "clear"})` : ""
      }`}
    >
      <Icon size={12} strokeWidth={2.5} />
    </button>
  );
}
