"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useRef } from "react"

import { Button } from "@/components/ui/button"
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
    scroller.scrollBy({ left: direction * 340, behavior: "smooth" })
  }

  return (
    <section className="space-y-4" aria-labelledby={`${row.id}-heading`}>
      <div className="flex items-center justify-between gap-4">
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
        <div className="hidden gap-2 md:flex">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => scrollByCard(-1)}
          >
            <ChevronLeftIcon />
            <span className="sr-only">Scroll {row.title} left</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => scrollByCard(1)}
          >
            <ChevronRightIcon />
            <span className="sr-only">Scroll {row.title} right</span>
          </Button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="-mx-5 flex gap-5 overflow-x-auto px-5 pb-8 pt-4 [scrollbar-width:none] md:-mx-8 md:px-8 [&::-webkit-scrollbar]:hidden"
      >
        {row.films.map((film) => (
          <FilmCard key={film._id} film={film} onSelect={onSelectFilm} />
        ))}
      </div>
    </section>
  )
}
