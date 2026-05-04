"use client"

import { PlayIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { FilmBrowserFilm } from "@/lib/films/types"
import { cn } from "@/lib/utils"
import { FilmPoster } from "./FilmPoster"

type FilmCardProps = {
  film: FilmBrowserFilm
  onSelect: (film: FilmBrowserFilm) => void
}

function uniqueTags(values: Array<string | null | undefined>, limit: number) {
  const seen = new Set<string>()
  const tags: string[] = []

  for (const value of values) {
    const cleaned = value?.trim().replace(/\s+/g, " ")
    if (!cleaned) continue

    const normalized = cleaned.toLowerCase()
    if (seen.has(normalized)) continue

    seen.add(normalized)
    tags.push(cleaned)
    if (tags.length >= limit) break
  }

  return tags
}

function visibleTags(film: FilmBrowserFilm): string[] {
  const tags = uniqueTags(film.displayTags ?? [], 3)
  if (tags.length > 0) return tags

  return uniqueTags(
    [
      ...(film.locations ?? []),
      ...(film.subjects ?? []),
      ...(film.formats ?? []),
      ...(film.skills ?? []),
    ],
    3
  )
}

export function FilmCard({ film, onSelect }: FilmCardProps) {
  const tags = visibleTags(film)

  return (
    <article
      className={cn(
        "group relative w-[78vw] max-w-[320px] shrink-0 overflow-hidden rounded-lg bg-background text-left shadow-sm ring-1 ring-border transition-transform duration-200 hover:z-10 hover:scale-[1.03] focus-within:z-10 focus-within:scale-[1.03] focus-within:ring-2 focus-within:ring-ring sm:w-[300px]"
      )}
    >
      <button
        type="button"
        aria-label={`Play ${film.title ?? "Untitled film"}`}
        onClick={() => onSelect(film)}
        className="absolute inset-0 z-10 cursor-pointer rounded-lg border-0 bg-transparent p-0 focus-visible:outline-none"
      />

      <div className="relative aspect-video overflow-hidden bg-neutral-900">
        <FilmPoster film={film} sizes="320px" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-70" />
        <div className="absolute bottom-3 left-3 flex size-9 items-center justify-center rounded-full bg-white/90 text-neutral-950 shadow-sm">
          <PlayIcon className="ml-0.5 size-4 fill-current" />
        </div>
      </div>

      <div className="space-y-2 p-4">
        <div>
          <h3 className="line-clamp-1 text-sm font-semibold text-foreground">
            {film.title ?? "Untitled film"}
          </h3>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {[film.releaseYear, film.duration].filter(Boolean).join(" / ")}
          </p>
        </div>

        {film.tagline && (
          <p className="line-clamp-2 text-xs text-muted-foreground opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {film.tagline}
          </p>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <Button
          asChild
          size="sm"
          className="pointer-events-none hidden opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:inline-flex"
        >
          <span>
            <PlayIcon data-icon="inline-start" />
            Play
          </span>
        </Button>
      </div>
    </article>
  )
}
