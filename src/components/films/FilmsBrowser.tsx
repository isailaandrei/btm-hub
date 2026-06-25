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
import { FilmsHero } from "./FilmsHero"

type FilmsBrowserProps = {
  films: FilmBrowserFilm[]
  collections: FilmBrowserCollection[]
  rowVisibility: FilmRowVisibilitySettings
  /** Spotlighted in the cinematic hero; its play CTA reuses the modal below. */
  featuredFilm?: FilmBrowserFilm | null
}

export function FilmsBrowser({
  films,
  collections,
  rowVisibility,
  featuredFilm,
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
    <>
      <h1 className="sr-only">Films</h1>

      {featuredFilm && (
        <FilmsHero
          film={featuredFilm}
          onPlay={() => setActiveFilm(featuredFilm)}
        />
      )}

      <div className="mx-auto max-w-[1420px] space-y-10 px-5 py-16 md:px-8 lg:px-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl tracking-wide text-white sm:text-3xl">
              All films
            </h2>
            <p className="mt-1 max-w-md font-serif text-sm text-white/70">
              Browse the full catalogue — search or filter by location, subject,
              format, and skill.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <label className="relative block sm:w-72">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/50" />
              <span className="sr-only">Search films</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, subject, location..."
                className="h-12 w-full rounded-full border border-white/15 bg-white/5 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-white/30 focus:ring-2 focus:ring-white/20"
              />
            </label>

            <FilmFilterSheet
              options={filterOptions}
              filters={filters}
              onChange={setFilters}
            />
          </div>
        </div>

        {rows.length > 0 ? (
          <div className="space-y-12">
            {rows.map((row) => (
              <FilmRow key={row.id} row={row} onSelectFilm={setActiveFilm} />
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <h2 className="text-lg font-semibold text-white">
              No films match your search
            </h2>
            <p className="mt-2 text-sm text-white/60">
              Adjust the search or filters to browse the full catalog.
            </p>
            {hasActiveQuery && (
              <Button
                type="button"
                variant="outline"
                className="mt-5 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
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
      </div>

      <FilmPlaybackModal
        film={activeFilm}
        onOpenChange={(open) => !open && setActiveFilm(null)}
      />
    </>
  )
}
