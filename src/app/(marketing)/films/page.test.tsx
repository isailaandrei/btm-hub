import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/films/FilmsBrowser", () => ({
  FilmsBrowser: () => <div data-testid="films-browser" />,
}));

vi.mock("@/lib/data/sanity", () => ({
  getFilmCollections: vi.fn().mockResolvedValue([]),
  getFilms: vi.fn().mockResolvedValue([
    {
      _id: "film-1",
      title: "Reef Film",
      videoEmbed: null,
    },
  ]),
  getFilmsPageSettings: vi.fn().mockResolvedValue({
    showLatestRow: true,
    showAllVideosRow: true,
  }),
}));

vi.mock("@/lib/films/posters", () => ({
  filmHeroBackdropUrl: vi.fn(() => null),
  withCollectionFilmPosterUrls: vi.fn((collections) => collections),
  withFilmPosterUrls: vi.fn((films) => films),
}));

const { default: FilmsPage } = await import("./page");

describe("FilmsPage", () => {
  it("renders the films browser on the cinematic #020306 dark theme", async () => {
    const html = renderToStaticMarkup(await FilmsPage());

    expect(html).toContain("dark min-h-screen bg-[#020306] text-white");
    expect(html).toContain('data-testid="films-browser"');
    // The old light marketing theme + centered hero copy are gone.
    expect(html).not.toContain("bg-muted");
    expect(html).not.toContain("Stories captured beneath the surface");
    expect(html).not.toContain("Explore our underwater film portfolio through");
  });
});
