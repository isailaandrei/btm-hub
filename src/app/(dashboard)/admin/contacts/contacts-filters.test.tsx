/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tag, TagCategory } from "@/types/database";
import { ContactsFilters } from "./contacts-filters";

vi.mock("./column-picker", () => ({
  ColumnPicker: () => <button type="button">Columns</button>,
}));

describe("ContactsFilters", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function makeCategory(overrides: Partial<TagCategory>): TagCategory {
    return {
      id: "category-1",
      name: "Category",
      color: "blue",
      sort_order: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  function makeTag(overrides: Partial<Tag>): Tag {
    return {
      id: "tag-1",
      category_id: "category-1",
      name: "Tag",
      sort_order: 1,
      updated_at: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("separates filtering controls from table configuration controls", () => {
    act(() => {
      root.render(
        <ContactsFilters
          search=""
          selectedTagIds={[]}
          tagCategories={[
            makeCategory({ id: "category-role", name: "Role" }),
            makeCategory({ id: "category-level", name: "Level" }),
          ]}
          tags={[
            makeTag({
              id: "tag-filmmaker",
              category_id: "category-role",
              name: "Filmmaker",
            }),
            makeTag({
              id: "tag-advanced",
              category_id: "category-level",
              name: "Advanced",
            }),
          ]}
          visibleColumns={[]}
          previouslySelectedColumns={[]}
          pendingFilter={[]}
          onSearchChange={() => undefined}
          onTagToggle={() => undefined}
          onClearTags={() => undefined}
          onColumnToggle={() => undefined}
          onPendingFilterChange={() => undefined}
        />,
      );
    });

    const rows = [...container.querySelectorAll("[data-testid]")];
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      "contacts-filter-row",
      "contacts-table-controls",
    ]);

    const filterRow = container.querySelector('[data-testid="contacts-filter-row"]');
    const tableControls = container.querySelector(
      '[data-testid="contacts-table-controls"]',
    );

    expect(filterRow?.textContent).toContain("Pending");
    expect(filterRow?.textContent).toContain("Filters");
    expect(filterRow?.textContent).not.toContain("Columns");
    expect(filterRow?.textContent).not.toContain("Sync");

    expect(tableControls?.textContent).toContain("Columns");
    expect(tableControls?.textContent).not.toContain("Sync");
    expect(tableControls?.textContent).not.toContain("Pending");

    expect(filterRow?.textContent).not.toContain("Role");
    expect(filterRow?.textContent).not.toContain("Level");
  });
});
