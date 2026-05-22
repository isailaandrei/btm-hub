/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tag, TagCategory } from "@/types/database";

const mockEnsureContacts = vi.fn();
let mockTagCategories: TagCategory[] | null = [];
let mockTags: Tag[] | null = [];

vi.mock("../admin-data-provider", () => ({
  useAdminContactsData: () => ({
    tagCategories: mockTagCategories,
    tags: mockTags,
    contactsError: null,
    ensureContacts: mockEnsureContacts,
  }),
}));

vi.mock("./actions", () => ({
  editTag: vi.fn(),
  removeCategory: vi.fn(),
  removeTag: vi.fn(),
  submitCategoryEditForm: vi.fn(),
  submitCategoryForm: vi.fn(),
  submitTagForm: vi.fn(),
}));

const category: TagCategory = {
  id: "category-1",
  name: "Status",
  color: "blue",
  sort_order: 1000,
  created_at: "2026-05-22T00:00:00Z",
  updated_at: "2026-05-22T00:00:00Z",
};

const tag: Tag = {
  id: "tag-1",
  category_id: "category-1",
  name: "Active",
  sort_order: 1000,
  updated_at: "2026-05-22T00:00:00Z",
};

describe("TagsPanel", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTagCategories = [category];
    mockTags = [tag];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps category edit controls in the compact header", async () => {
    const { TagsPanel } = await import("./tags-panel");

    act(() => {
      root.render(<TagsPanel />);
    });

    const categoryCard = container.querySelector<HTMLElement>(
      "[data-tag-category-card]",
    );
    expect(categoryCard).toBeTruthy();
    expect(
      categoryCard?.querySelector("[data-tag-category-header] button[data-category-edit-button]"),
    ).toBeTruthy();
    expect(
      categoryCard?.querySelector("[data-tag-category-content] button[data-category-edit-button]"),
    ).toBeNull();
  });
});
