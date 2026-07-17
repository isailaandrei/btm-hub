import { describe, expect, it } from "vitest";
import { buildFilmRows } from "./rows";
import type { FilmBrowserCollection, FilmBrowserFilm } from "./types";

const films: FilmBrowserFilm[] = [
  { _id: "film-1", title: "Featured One", featured: true, releaseYear: 2024, sortOrder: 2 },
  { _id: "film-2", title: "Latest One", featured: false, releaseYear: 2026, sortOrder: 1 },
  { _id: "film-3", title: "Featured Two", featured: true, releaseYear: 2025, sortOrder: 3 },
];

const titles = {
  featuredRowTitle: "Featured",
  latestRowTitle: "Latest",
  allFilmsRowTitle: "All Films",
};

describe("buildFilmRows", () => {
  it("puts curated collections before fallback rows", () => {
    const collections: FilmBrowserCollection[] = [
      {
        _id: "collection-1",
        title: "Ocean Stories",
        description: "Curated row",
        films: [films[1], films[0]],
      },
    ];

    expect(
      buildFilmRows(films, collections, undefined, titles).map(
        (row) => row.title,
      ),
    ).toEqual(["Ocean Stories", "Featured", "Latest", "All Films"]);
  });

  it("removes empty curated collections", () => {
    expect(
      buildFilmRows(films, [{ _id: "collection-1", title: "Empty", films: [] }]).map((row) => row.title),
    ).not.toContain("Empty");
  });

  it("filters curated collection films to the visible film set", () => {
    const rows = buildFilmRows([films[0]], [
      {
        _id: "collection-1",
        title: "Filtered Collection",
        films: [films[0], films[1]],
      },
    ]);

    expect(rows[0]).toMatchObject({
      id: "collection-collection-1",
      title: "Filtered Collection",
    });
    expect(rows[0].films.map((film) => film._id)).toEqual(["film-1"]);
  });

  it("sorts latest by release year descending", () => {
    const latest = buildFilmRows(films, []).find((row) => row.id === "latest");
    expect(latest?.films.map((film) => film._id)).toEqual(["film-2", "film-3", "film-1"]);
  });

  it("omits Featured row when no films are featured", () => {
    const rows = buildFilmRows(
      films.map((film) => ({ ...film, featured: false })),
      [],
    );
    expect(rows.map((row) => row.id)).toEqual(["latest", "all"]);
  });

  it("can hide the automatic latest row", () => {
    const rows = buildFilmRows(films, [], { showLatestRow: false });

    expect(rows.map((row) => row.id)).toEqual(["featured", "all"]);
  });

  it("can hide the automatic all videos row", () => {
    const rows = buildFilmRows(films, [], { showAllVideosRow: false });

    expect(rows.map((row) => row.id)).toEqual(["featured", "latest"]);
  });

  it("built-in rows still appear with a null title when no titles are passed", () => {
    const rows = buildFilmRows(films, []);

    expect(rows.map((row) => row.id)).toEqual(["featured", "latest", "all"]);
    expect(rows.map((row) => row.title)).toEqual([null, null, null]);
  });
});
