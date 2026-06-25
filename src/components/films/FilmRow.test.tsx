import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FilmRow as FilmRowType } from "@/lib/films/types";

vi.mock("./FilmCard", () => ({
  FilmCard: ({ film }: { film: { title: string | null } }) => (
    <div>{film.title}</div>
  ),
}));

const { FilmRow } = await import("./FilmRow");

const row: FilmRowType = {
  id: "featured",
  title: "Featured",
  films: [
    { _id: "film-1", title: "Reef Film" },
    { _id: "film-2", title: "Open Water" },
  ],
};

describe("FilmRow", () => {
  it("uses denser full-width rows with hover edge overlay controls", () => {
    const html = renderToStaticMarkup(
      <FilmRow row={row} onSelectFilm={() => {}} />,
    );

    expect(html).toContain("group/row");
    expect(html).toContain("gap-2");
    expect(html).toContain("px-7");
    expect(html).toContain("md:px-10");
    expect(html).toContain("lg:px-16");
    expect(html).toContain("absolute left-0 top-0");
    // Edge-fade overlays dissolve into the cinematic #020306 base (dark reskin).
    expect(html).toContain("bg-gradient-to-r from-[#020306]");
    expect(html).toContain("absolute right-0 top-0");
    expect(html).toContain("bg-gradient-to-l from-[#020306]");
    expect(html).toContain("group-hover/row:opacity-100");
    expect(html).not.toContain("rounded-full");
  });
});
