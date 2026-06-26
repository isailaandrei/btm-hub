import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { FilmBrowserFilm } from "@/lib/films/types"

vi.mock("next/image", () => ({
  default: (props: { src?: string; alt?: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt ?? ""} className={props.className} />
  ),
}))

const { FilmsHero } = await import("./FilmsHero")

const film: FilmBrowserFilm = {
  _id: "film-1",
  title: "Guardians of the Reef",
  tagline: "A year with the manta rays of Raja Ampat",
  duration: "24m",
  releaseYear: 2026,
  posterUrl: "https://example.com/featured.jpg",
  slug: { current: "guardians-of-the-reef" },
  featured: true,
}

describe("FilmsHero", () => {
  it("renders the featured film as a cinematic billboard with a play CTA", () => {
    const html = renderToStaticMarkup(<FilmsHero film={film} onPlay={() => {}} />)

    expect(html).toContain("Guardians of the Reef")
    expect(html).toContain("A year with the manta rays of Raja Ampat")
    expect(html).toContain("Featured film")
    expect(html).toContain("Watch film")
    expect(html).toContain("/films/guardians-of-the-reef")
    // The single atmospheric backdrop is the film's own still.
    expect(html).toContain("https://example.com/featured.jpg")
  })

  it("falls back to a gradient backdrop when the featured film has no still", () => {
    const html = renderToStaticMarkup(
      <FilmsHero film={{ ...film, posterUrl: null }} onPlay={() => {}} />,
    )

    expect(html).toContain("Guardians of the Reef")
    expect(html).toContain("Watch film")
    expect(html).not.toContain("https://example.com/featured.jpg")
  })

  it("uses the hi-res heroImageUrl for the backdrop when provided", () => {
    const html = renderToStaticMarkup(
      <FilmsHero
        film={film}
        heroImageUrl="https://cdn.sanity.io/images/p/d/poster123-2400x1350.jpg?w=2400"
        onPlay={() => {}}
      />,
    )

    expect(html).toContain("poster123-2400x1350")
    // The low-res video thumbnail is not used when a hero image is supplied.
    expect(html).not.toContain("https://example.com/featured.jpg")
  })
})
