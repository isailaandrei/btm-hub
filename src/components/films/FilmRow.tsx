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

      <div className="-mx-5 flex items-center gap-4 md:-mx-8 md:px-8">
        <div className="hidden shrink-0 md:flex">
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            onClick={() => scrollByCard(-1)}
            className="rounded-full border-border bg-background/80 shadow-sm hover:bg-background"
          >
            <ChevronLeftIcon />
            <span className="sr-only">Scroll {row.title} left</span>
          </Button>
        </div>

        <div
          ref={scrollerRef}
          className="flex min-w-0 flex-1 gap-5 overflow-x-auto px-5 pb-8 pt-4 [scrollbar-width:none] md:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {row.films.map((film) => (
            <FilmCard key={film._id} film={film} onSelect={onSelectFilm} />
          ))}
        </div>

        <div className="hidden shrink-0 md:flex">
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            onClick={() => scrollByCard(1)}
            className="rounded-full border-border bg-background/80 shadow-sm hover:bg-background"
          >
            <ChevronRightIcon />
            <span className="sr-only">Scroll {row.title} right</span>
          </Button>
        </div>
      </div>
    </section>
  )
}
