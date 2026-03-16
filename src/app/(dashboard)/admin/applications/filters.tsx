"use client";

import { useState } from "react";
import type { ApplicationStatus, ProgramSlug } from "@/types/database";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { STATUSES, PROGRAMS } from "./constants";

interface ApplicationFiltersProps {
  program: ProgramSlug | undefined;
  status: ApplicationStatus | undefined;
  search: string;
  onProgramChange: (value: ProgramSlug | undefined) => void;
  onStatusChange: (value: ApplicationStatus | undefined) => void;
  onSearchChange: (value: string) => void;
}

export function ApplicationFilters({
  program,
  status,
  search,
  onProgramChange,
  onStatusChange,
  onSearchChange,
}: ApplicationFiltersProps) {
  const [searchInput, setSearchInput] = useState(search);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form
        className="flex items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSearchChange(searchInput);
        }}
      >
        <input
          type="text"
          placeholder="Search by name or email..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Search
        </button>
      </form>

      <Select
        value={program ?? "all"}
        onValueChange={(v) => onProgramChange(v === "all" ? undefined : (v as ProgramSlug))}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All Programs" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Programs</SelectItem>
          {PROGRAMS.map((p) => (
            <SelectItem key={p} value={p} className="capitalize">
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status ?? "all"}
        onValueChange={(v) => onStatusChange(v === "all" ? undefined : (v as ApplicationStatus))}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="capitalize">
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
