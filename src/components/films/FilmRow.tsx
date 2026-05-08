"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useRef } from "react"

import type {
  FilmBrowserFilm,
  FilmRow as FilmRowType,
} from "@/lib/films/types"
import { FilmCard } from "./FilmCard"

type FilmRowProps = {
  row: FilmRowType
  onSelectFilm: (film: FilmBrowserFilm) => void
}

export function FilmRow({ row, onSelectFilm }: FilmRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  function scrollByCard(direction: -1 | 1) {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollBy({ left: direction * 310, behavior: "smooth" })
  }

  return (
    <section className="group/row space-y-2" aria-labelledby={`${row.id}-heading`}>
      <div>
        <h2
          id={`${row.id}-heading`}
          className="text-xl font-semibold text-foreground"
        >
          {row.title}
        </h2>
        {row.description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {row.description}
          </p>
        )}
      </div>

      <div className="relative -mx-5 md:-mx-8 lg:-mx-12">
        <div
          ref={scrollerRef}
          className="flex min-w-0 gap-2 overflow-x-auto px-7 pb-6 pt-3 [scrollbar-width:none] md:px-10 lg:px-16 [&::-webkit-scrollbar]:hidden"
        >
          {row.films.map((film) => (
            <FilmCard key={film._id} film={film} onSelect={onSelectFilm} />
          ))}
        </div>

        <div className="pointer-events-none absolute left-0 top-0 hidden h-full w-14 items-center bg-gradient-to-r from-muted via-muted/90 to-transparent opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 md:flex">
          <button
            type="button"
            onClick={() => scrollByCard(-1)}
            className="pointer-events-auto flex h-full w-11 items-center justify-center text-foreground/65 transition-colors hover:bg-background/35 hover:text-foreground"
          >
            <ChevronLeftIcon className="size-7" />
            <span className="sr-only">Scroll {row.title} left</span>
          </button>
        </div>

        <div className="pointer-events-none absolute right-0 top-0 hidden h-full w-14 items-center justify-end bg-gradient-to-l from-muted via-muted/90 to-transparent opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 md:flex">
          <button
            type="button"
            onClick={() => scrollByCard(1)}
            className="pointer-events-auto flex h-full w-11 items-center justify-center text-foreground/65 transition-colors hover:bg-background/35 hover:text-foreground"
          >
            <ChevronRightIcon className="size-7" />
            <span className="sr-only">Scroll {row.title} right</span>
          </button>
        </div>
      </div>
    </section>
  )
}
