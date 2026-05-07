"use client"

import { SearchIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  buildFilmFilterOptions,
  createEmptyFilmFilters,
  filterFilms,
} from "@/lib/films/filtering"
import { buildFilmRows } from "@/lib/films/rows"
import type {
  FilmBrowserCollection,
  FilmBrowserFilm,
  FilmFilterState,
  FilmRowVisibilitySettings,
} from "@/lib/films/types"
import { FilmFilterSheet } from "./FilmFilterSheet"
import { FilmPlaybackModal } from "./FilmPlaybackModal"
import { FilmRow } from "./FilmRow"

type FilmsBrowserProps = {
  films: FilmBrowserFilm[]
  collections: FilmBrowserCollection[]
  rowVisibility: FilmRowVisibilitySettings
}

export function FilmsBrowser({
  films,
  collections,
  rowVisibility,
}: FilmsBrowserProps) {
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState<FilmFilterState>(() =>
    createEmptyFilmFilters()
  )
  const [activeFilm, setActiveFilm] = useState<FilmBrowserFilm | null>(null)

  const filterOptions = useMemo(() => buildFilmFilterOptions(films), [films])
  const visibleFilms = useMemo(
    () => filterFilms(films, search, filters),
    [films, search, filters]
  )
  const hasActiveQuery =
    search.trim().length > 0 ||
    Object.values(filters).some((values) => values.length > 0)
  const rows = useMemo(
    () =>
      hasActiveQuery
        ? visibleFilms.length > 0
          ? [{ id: "matches", title: "Matching Films", films: visibleFilms }]
          : []
        : buildFilmRows(visibleFilms, collections, rowVisibility),
    [collections, hasActiveQuery, rowVisibility, visibleFilms]
  )

  return (
    <div className="space-y-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block sm:flex-1">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search films</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, subject, location..."
            className="h-12 w-full rounded-lg border border-border bg-background pl-11 pr-4 text-sm text-foreground shadow-sm outline-none transition-shadow focus:ring-2 focus:ring-ring"
          />
        </label>

        <FilmFilterSheet
          options={filterOptions}
          filters={filters}
          onChange={setFilters}
        />
      </div>

      {rows.length > 0 ? (
        <div className="space-y-12">
          {rows.map((row) => (
            <FilmRow key={row.id} row={row} onSelectFilm={setActiveFilm} />
          ))}
        </div>
      ) : (
        <div className="mx-auto max-w-md rounded-lg border border-border bg-background p-8 text-center">
          <h2 className="text-lg font-semibold text-foreground">
            No films match your search
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Adjust the search or filters to browse the full catalog.
          </p>
          {hasActiveQuery && (
            <Button
              type="button"
              variant="outline"
              className="mt-5"
              onClick={() => {
                setSearch("")
                setFilters(createEmptyFilmFilters())
              }}
            >
              Reset search and filters
            </Button>
          )}
        </div>
      )}

      <FilmPlaybackModal
        film={activeFilm}
        onOpenChange={(open) => !open && setActiveFilm(null)}
      />
    </div>
  )
}
