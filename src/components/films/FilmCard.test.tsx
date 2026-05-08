import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FilmBrowserFilm } from "@/lib/films/types";

vi.mock("./FilmPoster", () => ({
  FilmPoster: () => <div data-testid="film-poster" />,
}));

const { FilmCard } = await import("./FilmCard");

const film: FilmBrowserFilm = {
  _id: "film-1",
  title: "Reef Film",
  tagline: "A field story below the surface",
  duration: "12m",
  releaseYear: 2026,
  posterUrl: "https://example.com/poster.jpg",
  displayTags: ["Conservation"],
};

describe("FilmCard", () => {
  it("uses denser rounded Netflix-style cards with hover-revealed metadata", () => {
    const html = renderToStaticMarkup(
      <FilmCard film={film} onSelect={() => {}} />,
    );

    expect(html).toContain("max-w-[370px]");
    expect(html).toContain("lg:w-[360px]");
    expect(html).toContain("rounded-md");
    expect(html).not.toContain("rounded-lg");
    expect(html).toContain("hover:scale-[1.1]");
    expect(html).toContain("hover:shadow-2xl");
    expect(html).toContain("opacity-0");
    expect(html).toContain("group-hover:opacity-100");
  });
});
