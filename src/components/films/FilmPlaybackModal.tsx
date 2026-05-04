"use client"

import Link from "next/link"
import { ExternalLinkIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getSafeFilmEmbedUrl } from "@/lib/films/embed"
import type { FilmBrowserFilm } from "@/lib/films/types"

type FilmPlaybackModalProps = {
  film: FilmBrowserFilm | null
  onOpenChange: (open: boolean) => void
}

function filmHref(film: FilmBrowserFilm): string | null {
  const slug = film.slug?.current
  return slug ? `/films/${slug}` : null
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

function tagsFor(film: FilmBrowserFilm): string[] {
  return uniqueTags(
    [
      ...(film.displayTags ?? []),
      ...(film.locations ?? []),
      ...(film.subjects ?? []),
      ...(film.formats ?? []),
      ...(film.skills ?? []),
    ],
    8
  )
}

export function FilmPlaybackModal({
  film,
  onOpenChange,
}: FilmPlaybackModalProps) {
  const open = Boolean(film)
  const embedUrl = getSafeFilmEmbedUrl(film?.videoEmbed)
  const href = film ? filmHref(film) : null
  const tags = film ? tagsFor(film) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden bg-neutral-950 text-white sm:rounded-lg">
        {film && (
          <div>
            <div className="aspect-video bg-black">
              {embedUrl ? (
                <iframe
                  src={embedUrl}
                  title={film.title ?? "Film video"}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  sandbox="allow-scripts allow-same-origin allow-presentation"
                  tabIndex={-1}
                  allowFullScreen
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-300">
                  Video unavailable. Check the film embed URL in Sanity.
                </div>
              )}
            </div>

            <div className="space-y-5 p-5 md:p-7">
              <DialogHeader>
                <DialogTitle className="text-2xl text-white">
                  {film.title ?? "Untitled film"}
                </DialogTitle>
                {film.tagline ? (
                  <DialogDescription className="text-neutral-300">
                    {film.tagline}
                  </DialogDescription>
                ) : (
                  <DialogDescription className="sr-only">
                    Preview playback and details for{" "}
                    {film.title ?? "this film"}.
                  </DialogDescription>
                )}
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-300">
                {film.releaseYear && <span>{film.releaseYear}</span>}
                {film.duration && <span>{film.duration}</span>}
                {film.status === "in-production" && (
                  <Badge variant="secondary">In Production</Badge>
                )}
                {film.status === "coming-soon" && (
                  <Badge variant="secondary">Coming Soon</Badge>
                )}
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="border-white/20 bg-white/10 text-white"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {href && (
                <Button asChild variant="secondary">
                  <Link href={href}>
                    More details
                    <ExternalLinkIcon data-icon="inline-end" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
