import Image from "next/image"
import type { FilmBrowserFilm } from "@/lib/films/types"
import { cn } from "@/lib/utils"

type FilmPosterProps = {
  film: FilmBrowserFilm
  className?: string
  sizes: string
  priority?: boolean
}

export function FilmPoster({
  film,
  className,
  sizes,
  priority = false,
}: FilmPosterProps) {
  const alt = film.title ? `${film.title} video thumbnail` : "Film poster"

  if (!film.posterUrl) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-900 via-slate-800 to-primary/60 p-4 text-center text-sm font-medium text-white",
          className
        )}
      >
        {film.title ?? "Untitled film"}
      </div>
    )
  }

  return (
    <Image
      src={film.posterUrl}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      className={cn("object-cover", className)}
    />
  )
}
