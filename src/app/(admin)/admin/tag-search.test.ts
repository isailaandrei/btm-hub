import { describe, expect, it } from "vitest";
import { categoryNameMatches, searchTags } from "./tag-search";

function category(id: string, name: string, sort_order: number) {
  return { id, name, sort_order };
}

function tag(category_id: string, name: string, sort_order: number) {
  return { id: `${category_id}-${name}`, category_id, name, sort_order };
}

// Mirrors the production shape: program categories share generic pipeline
// tag names, so only category names distinguish "azores" from "maldives".
const categories = [
  category("status", "Status", 1),
  category("azores-w2", "26 Azores Summer Academy Week 2", 2),
  category("maldives", "26 Maldives Academy ScubaSpa", 3),
  category("interested-in", "Interested in", 4),
  category("azores-nikon", "26 Azores Nikon Project", 5),
  category("empty", "No Tags Yet", 6),
];

const tags = [
  tag("status", "Was Emailed", 1),
  tag("status", "Waiting for response", 2),
  tag("azores-w2", "Interested", 1),
  tag("azores-w2", "Joining", 2),
  tag("azores-w2", "Declined", 3),
  tag("maldives", "Interested", 1),
  tag("maldives", "Joining", 2),
  tag("interested-in", "Workshops", 1),
  tag("interested-in", "Prints", 2),
  tag("azores-nikon", "Joining", 1),
];

describe("searchTags", () => {
  it("returns every category's tags for an empty query, omitting empty categories", () => {
    const groups = searchTags(categories, tags, "");
    expect(groups.map((g) => g.category.id)).toEqual([
      "status",
      "azores-w2",
      "maldives",
      "interested-in",
      "azores-nikon",
    ]);
    expect(groups[0].tags.map((t) => t.name)).toEqual([
      "Was Emailed",
      "Waiting for response",
    ]);
  });

  it("treats a whitespace-only query like an empty one", () => {
    expect(searchTags(categories, tags, "   ")).toEqual(
      searchTags(categories, tags, ""),
    );
  });

  it("includes a category's whole group when the query hits the category name", () => {
    const groups = searchTags(categories, tags, "azores");
    expect(groups.map((g) => g.category.id)).toEqual([
      "azores-w2",
      "azores-nikon",
    ]);
    expect(groups[0].tags.map((t) => t.name)).toEqual([
      "Interested",
      "Joining",
      "Declined",
    ]);
  });

  it("narrows to matching tags when a word hits tag names across categories", () => {
    const groups = searchTags(categories, tags, "joining");
    expect(
      groups.map((g) => [g.category.id, g.tags.map((t) => t.name)]),
    ).toEqual([
      ["azores-w2", ["Joining"]],
      ["maldives", ["Joining"]],
      ["azores-nikon", ["Joining"]],
    ]);
  });

  it("requires every word to match somewhere in category + tag name", () => {
    const groups = searchTags(categories, tags, "azores joining");
    expect(
      groups.map((g) => [g.category.id, g.tags.map((t) => t.name)]),
    ).toEqual([
      ["azores-w2", ["Joining"]],
      ["azores-nikon", ["Joining"]],
    ]);
  });

  it("matches both a category named by the word and same-named tags elsewhere", () => {
    const groups = searchTags(categories, tags, "interested");
    expect(
      groups.map((g) => [g.category.id, g.tags.map((t) => t.name)]),
    ).toEqual([
      ["azores-w2", ["Interested"]],
      ["maldives", ["Interested"]],
      ["interested-in", ["Workshops", "Prints"]],
    ]);
  });

  it("is case-insensitive", () => {
    expect(searchTags(categories, tags, "AZORES Joining")).toEqual(
      searchTags(categories, tags, "azores joining"),
    );
  });

  it("returns an empty list when nothing matches", () => {
    expect(searchTags(categories, tags, "zanzibar")).toEqual([]);
  });

  describe("categoryNameMatches", () => {
    it("matches when every word appears in the category name", () => {
      expect(
        categoryNameMatches("26 Azores Summer Academy Week 2", "azores week"),
      ).toBe(true);
      expect(
        categoryNameMatches("26 Azores Summer Academy Week 2", "azores joining"),
      ).toBe(false);
    });

    it("never matches an empty or whitespace-only query", () => {
      expect(categoryNameMatches("Status", "")).toBe(false);
      expect(categoryNameMatches("Status", "   ")).toBe(false);
    });
  });

  it("orders categories and tags by sort_order regardless of input order", () => {
    const shuffledCategories = [categories[4], categories[1], categories[0]];
    const shuffledTags = [...tags].reverse();
    const groups = searchTags(shuffledCategories, shuffledTags, "");
    expect(groups.map((g) => g.category.id)).toEqual([
      "status",
      "azores-w2",
      "azores-nikon",
    ]);
    expect(groups[1].tags.map((t) => t.name)).toEqual([
      "Interested",
      "Joining",
      "Declined",
    ]);
  });
});
