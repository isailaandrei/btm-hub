"use client"

import { SlidersHorizontalIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  FILM_METADATA_KEYS,
  countActiveFilmFilters,
  createEmptyFilmFilters,
  toggleFilmFilter,
} from "@/lib/films/filtering"
import type {
  FilmFilterOptions,
  FilmFilterState,
  FilmMetadataKey,
} from "@/lib/films/types"

const FILTER_LABELS: Record<FilmMetadataKey, string> = {
  locations: "Location",
  subjects: "Subject",
  formats: "Format",
  skills: "Skill",
}

type FilmFilterSheetProps = {
  options: FilmFilterOptions
  filters: FilmFilterState
  onChange: (filters: FilmFilterState) => void
}

export function FilmFilterSheet({
  options,
  filters,
  onChange,
}: FilmFilterSheetProps) {
  const activeCount = countActiveFilmFilters(filters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Sheet>
        <SheetTrigger asChild>
          <Button type="button" variant="outline">
            <SlidersHorizontalIcon data-icon="inline-start" />
            Filters
            {activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
          </Button>
        </SheetTrigger>
        <SheetContent className="dark border-white/10 bg-[#0a0d12] text-white">
          <SheetHeader>
            <SheetTitle>Filter films</SheetTitle>
            <SheetDescription>
              Refine the catalog by location, subject, format, and skill.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6">
            {FILM_METADATA_KEYS.map((key) => (
              <fieldset key={key} className="space-y-3">
                <legend className="text-sm font-medium text-foreground">
                  {FILTER_LABELS[key]}
                </legend>
                <div className="space-y-2">
                  {options[key].map((value) => {
                    const checked = filters[key].includes(value)
                    return (
                      <label
                        key={value}
                        className="flex items-center gap-3 text-sm text-foreground"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            onChange(toggleFilmFilter(filters, key, value))
                          }
                        />
                        <span>{value}</span>
                      </label>
                    )
                  })}
                  {options[key].length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No {FILTER_LABELS[key].toLowerCase()} filters yet.
                    </p>
                  )}
                </div>
              </fieldset>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {FILM_METADATA_KEYS.flatMap((key) =>
        filters[key].map((value) => (
          <button
            key={`${key}-${value}`}
            type="button"
            aria-label={`Remove ${value} filter`}
            onClick={() => onChange(toggleFilmFilter(filters, key, value))}
            className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {value} x
          </button>
        ))
      )}

      {activeCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(createEmptyFilmFilters())}
        >
          Clear filters
        </Button>
      )}
    </div>
  )
}
