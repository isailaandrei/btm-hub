"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

interface ColumnSortToggleProps {
  active: boolean;
  direction: "asc" | "desc" | null;
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
      onClick={onClick}
      className={`ml-0.5 inline-flex items-center rounded p-0.5 text-xs transition-colors ${
        active
          ? "text-primary"
          : "text-muted-foreground/50 hover:text-muted-foreground"
      }`}
      aria-label={`Sort by ${label}${
        active ? ` (${direction}ending, click to ${direction === "asc" ? "reverse" : "clear"})` : ""
      }`}
    >
      <Icon size={12} strokeWidth={2.5} />
    </button>
  );
}
