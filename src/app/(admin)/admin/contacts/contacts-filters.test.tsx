/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tag, TagCategory } from "@/types/database";
import { ContactsFilters } from "./contacts-filters";

vi.mock("./column-picker", () => ({
  ColumnPicker: ({ disabled }: { disabled?: boolean }) => (
    <button type="button" disabled={disabled}>
      Columns
    </button>
  ),
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

  function renderFilters({
    disabled = false,
    onTagToggle = () => undefined,
  }: { disabled?: boolean; onTagToggle?: (tagId: string) => void } = {}) {
    act(() => {
      root.render(
        <ContactsFilters
          disabled={disabled}
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
          onSearchChange={() => undefined}
          onTagToggle={onTagToggle}
          onClearTags={() => undefined}
          onColumnToggle={() => undefined}
        />,
      );
    });
  }

  it("separates filtering controls from table configuration controls", () => {
    renderFilters();

    const rows = [...container.querySelectorAll("[data-testid]")];
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      "contacts-filters-toolbar",
      "contacts-filter-row",
      "contacts-table-controls",
    ]);

    const filterRow = container.querySelector('[data-testid="contacts-filter-row"]');
    const tableControls = container.querySelector(
      '[data-testid="contacts-table-controls"]',
    );

    expect(filterRow?.textContent).toContain("Tags");
    expect(filterRow?.textContent).not.toContain("Columns");
    expect(filterRow?.textContent).not.toContain("Sync");

    expect(tableControls?.textContent).toContain("Columns");
    expect(tableControls?.textContent).not.toContain("Sync");

    expect(filterRow?.textContent).not.toContain("Role");
    expect(filterRow?.textContent).not.toContain("Level");
  });

  it("keeps table configuration controls pinned to the right on wide screens", () => {
    renderFilters();

    const toolbar = container.querySelector(
      '[data-testid="contacts-filters-toolbar"]',
    );
    const tableControls = container.querySelector(
      '[data-testid="contacts-table-controls"]',
    );

    expect(toolbar?.className).toContain("xl:grid-cols");
    expect(tableControls?.className).toContain("xl:justify-self-end");
    expect(tableControls?.className).toContain("shrink-0");
  });

  it("disables search, filter, and column controls during full hydration", () => {
    renderFilters({ disabled: true });

    const searchInput = container.querySelector("input[type='text']");
    const filtersButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Tags"),
    );
    const columnsButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Columns"),
    );

    expect(searchInput).toHaveProperty("disabled", true);
    expect(filtersButton).toHaveProperty("disabled", true);
    expect(columnsButton).toHaveProperty("disabled", true);
  });

  it("shows tag categories first and reveals tags only when a category expands", async () => {
    renderFilters();

    const filtersButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Tags"),
    );
    expect(filtersButton).toBeDefined();

    await act(async () => {
      filtersButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("Role");
    expect(document.body.textContent).toContain("Level");
    expect(document.body.textContent).not.toContain("Filmmaker");
    expect(document.body.textContent).not.toContain("Advanced");

    const roleCategory = document.body.querySelector(
      '[data-testid="contacts-filter-category-category-role"]',
    );
    expect(roleCategory).not.toBeNull();

    await act(async () => {
      roleCategory?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("Filmmaker");
    expect(document.body.textContent).not.toContain("Advanced");

    const levelCategory = document.body.querySelector(
      '[data-testid="contacts-filter-category-category-level"]',
    );
    expect(levelCategory).not.toBeNull();

    await act(async () => {
      levelCategory?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("Filmmaker");
    expect(document.body.textContent).toContain("Advanced");
  });

  async function openTagsPopover() {
    const filtersButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Tags"),
    );
    expect(filtersButton).toBeDefined();
    await act(async () => {
      filtersButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    return filtersButton;
  }

  async function typeTagSearch(value: string) {
    const input = document.body.querySelector(
      '[data-testid="contacts-filter-tag-search"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setValue?.call(input, value);
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function expandCategory(categoryId: string) {
    const header = document.body.querySelector(
      `[data-testid="contacts-filter-category-${categoryId}"]`,
    );
    expect(header).not.toBeNull();
    await act(async () => {
      header?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("narrows to matching categories when searching, still collapsed", async () => {
    renderFilters();
    await openTagsPopover();
    await typeTagSearch("advanced");

    expect(document.body.textContent).toContain("Level");
    expect(document.body.textContent).not.toContain("Advanced");
    expect(document.body.textContent).not.toContain("Role");

    await expandCategory("category-level");
    expect(document.body.textContent).toContain("Advanced");
    expect(document.body.textContent).not.toContain("Filmmaker");
  });

  it("matches a category by name and reveals its tags only on expand", async () => {
    renderFilters();
    await openTagsPopover();
    await typeTagSearch("role");

    expect(document.body.textContent).toContain("Role");
    expect(document.body.textContent).not.toContain("Filmmaker");
    expect(document.body.textContent).not.toContain("Level");

    await expandCategory("category-role");
    expect(document.body.textContent).toContain("Filmmaker");
  });

  it("toggles a tag from expanded search results", async () => {
    const onTagToggle = vi.fn();
    renderFilters({ onTagToggle });
    await openTagsPopover();
    await typeTagSearch("advanced");
    await expandCategory("category-level");

    const checkbox = document.body.querySelector('[role="checkbox"]');
    expect(checkbox).not.toBeNull();
    await act(async () => {
      checkbox?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onTagToggle).toHaveBeenCalledWith("tag-advanced");
  });

  it("shows a no-match message for a query matching nothing", async () => {
    renderFilters();
    await openTagsPopover();
    await typeTagSearch("zanzibar");

    expect(document.body.textContent).toContain("No tags match");
    expect(document.body.textContent).not.toContain("Filmmaker");
    expect(document.body.textContent).not.toContain("Advanced");
  });

  it("resets the search and expansions when the popover closes", async () => {
    renderFilters();
    const filtersButton = await openTagsPopover();
    await typeTagSearch("advanced");
    await expandCategory("category-level");
    expect(document.body.textContent).toContain("Advanced");

    // Close and reopen: browse mode again, everything collapsed.
    await act(async () => {
      filtersButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      filtersButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const input = document.body.querySelector(
      '[data-testid="contacts-filter-tag-search"]',
    ) as HTMLInputElement | null;
    expect(input?.value).toBe("");
    expect(document.body.textContent).toContain("Role");
    expect(document.body.textContent).not.toContain("Advanced");
  });
});
