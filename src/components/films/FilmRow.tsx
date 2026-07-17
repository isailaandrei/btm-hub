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
    <section
      className="group/row space-y-2"
      aria-labelledby={row.title ? `${row.id}-heading` : undefined}
    >
      {row.title && (
        <div>
          <h2
            id={`${row.id}-heading`}
            className="text-xl font-semibold text-white"
          >
            {row.title}
          </h2>
          {row.description && (
            <p className="mt-1 max-w-2xl text-sm text-white/70">
              {row.description}
            </p>
          )}
        </div>
      )}

      <div className="relative -mx-5 md:-mx-8 lg:-mx-12">
        <div
          ref={scrollerRef}
          className="flex min-w-0 gap-2 overflow-x-auto px-7 pb-6 pt-3 [scrollbar-width:none] md:px-10 lg:px-16 [&::-webkit-scrollbar]:hidden"
        >
          {row.films.map((film) => (
            <FilmCard key={film._id} film={film} onSelect={onSelectFilm} />
          ))}
        </div>

        <div className="pointer-events-none absolute left-0 top-0 hidden h-full w-14 items-center bg-gradient-to-r from-[#020306] via-[#020306]/90 to-transparent opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 md:flex">
          <button
            type="button"
            onClick={() => scrollByCard(-1)}
            className="pointer-events-auto flex h-full w-11 items-center justify-center text-white/65 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronLeftIcon className="size-7" />
            <span className="sr-only">Scroll left</span>
          </button>
        </div>

        <div className="pointer-events-none absolute right-0 top-0 hidden h-full w-14 items-center justify-end bg-gradient-to-l from-[#020306] via-[#020306]/90 to-transparent opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 md:flex">
          <button
            type="button"
            onClick={() => scrollByCard(1)}
            className="pointer-events-auto flex h-full w-11 items-center justify-center text-white/65 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronRightIcon className="size-7" />
            <span className="sr-only">Scroll right</span>
          </button>
        </div>
      </div>
    </section>
  )
}
