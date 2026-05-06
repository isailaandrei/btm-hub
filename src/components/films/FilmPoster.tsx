import { SanityImage } from "@/components/sanity/SanityImage"
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
  const image = film.thumbnailImage ?? film.heroImage
  const alt = image?.alt ?? film.title ?? "Film poster"

  if (!image) {
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
    <SanityImage
      source={image}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      className={cn("object-cover", className)}
    />
  )
}
