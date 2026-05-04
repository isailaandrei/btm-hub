import { describe, expect, it } from "vitest";
import {
  createEmptyFilmFilters,
  buildFilmFilterOptions,
  countActiveFilmFilters,
  filterFilms,
  toggleFilmFilter,
} from "./filtering";
import type { FilmBrowserFilm } from "./types";

const films: FilmBrowserFilm[] = [
  {
    _id: "film-1",
    title: "Whales of Faial",
    tagline: "A blue-water documentary",
    locations: [" Azores ", "azores"],
    subjects: ["Whales", "Conservation", " whales "],
    formats: ["Documentary"],
    skills: ["Filming"],
    displayTags: ["Ocean story"],
    releaseYear: 2026,
  },
  {
    _id: "film-2",
    title: "Freedive Training",
    tagline: "Technique under pressure",
    locations: ["Indonesia"],
    subjects: ["Freediving"],
    formats: ["Tutorial"],
    skills: ["Breath-hold", "Equalization"],
    displayTags: ["Training"],
    releaseYear: 2025,
  },
];

describe("film filtering", () => {
  it("creates empty filters for every metadata group", () => {
    expect(createEmptyFilmFilters()).toEqual({
      locations: [],
      subjects: [],
      formats: [],
      skills: [],
    });
  });

  it("derives sorted unique filter options", () => {
    expect(buildFilmFilterOptions(films)).toEqual({
      locations: ["Azores", "Indonesia"],
      subjects: ["Conservation", "Freediving", "Whales"],
      formats: ["Documentary", "Tutorial"],
      skills: ["Breath-hold", "Equalization", "Filming"],
    });
  });

  it("matches search across title, tagline, and metadata", () => {
    expect(filterFilms(films, "blue-water", createEmptyFilmFilters()).map((film) => film._id)).toEqual(["film-1"]);
    expect(filterFilms(films, "equalization", createEmptyFilmFilters()).map((film) => film._id)).toEqual(["film-2"]);
  });

  it("applies selected filters as OR within a group and AND across groups", () => {
    const filters = {
      ...createEmptyFilmFilters(),
      locations: ["Azores", "Indonesia"],
      formats: ["Documentary"],
    };

    expect(filterFilms(films, "", filters).map((film) => film._id)).toEqual(["film-1"]);
  });

  it("toggles filter values immutably", () => {
    const selected = toggleFilmFilter(createEmptyFilmFilters(), "locations", "Azores");
    expect(selected.locations).toEqual(["Azores"]);
    expect(toggleFilmFilter(selected, "locations", "Azores").locations).toEqual([]);
  });

  it("counts active filter values", () => {
    expect(
      countActiveFilmFilters({
        locations: ["Azores"],
        subjects: ["Whales", "Conservation"],
        formats: [],
        skills: [],
      }),
    ).toBe(3);
  });
});
