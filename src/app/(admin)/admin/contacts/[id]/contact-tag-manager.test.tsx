/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  assignContactTag,
  createAndAssignContactTag,
  unassignContactTag,
} from "../actions";
import { ContactTagManager, type ContactTagRow } from "./contact-tag-manager";

const rollbackSpy = vi.fn();
const mockAddOptimisticContactTags = vi.fn(() => ({ rollback: rollbackSpy }));
const mockRemoveOptimisticContactTags = vi.fn(() => ({
  rollback: rollbackSpy,
}));
const mockAddOptimisticTag = vi.fn(() => ({ rollback: rollbackSpy }));

vi.mock("../../admin-data-provider", () => ({
  useAdminContactsData: () => ({
    addOptimisticContactTags: mockAddOptimisticContactTags,
    addOptimisticTag: mockAddOptimisticTag,
    removeOptimisticContactTags: mockRemoveOptimisticContactTags,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("../actions", () => ({
  assignContactTag: vi.fn(),
  createAndAssignContactTag: vi.fn(),
  unassignContactTag: vi.fn(),
}));

const statusCategory = {
  id: "category-1",
  name: "Status",
  color: "blue",
  sort_order: 1000,
  created_at: "2026-06-01T10:00:00.000Z",
};

const azoresCategory = {
  id: "category-2",
  name: "26 Azores Nikon Project",
  color: "green",
  sort_order: 2000,
  created_at: "2026-06-01T10:00:00.000Z",
};

const categories = [statusCategory, azoresCategory];

const tags = [
  {
    id: "tag-1",
    category_id: "category-1",
    name: "First",
    sort_order: 1000,
  },
  {
    id: "tag-2",
    category_id: "category-1",
    name: "Second",
    sort_order: 2000,
  },
  {
    id: "tag-3",
    category_id: "category-2",
    name: "Joining",
    sort_order: 1000,
  },
];

const assignedFirstRow: ContactTagRow = {
  tag_id: "tag-1",
  assigned_at: "2026-06-02T10:00:00.000Z",
  tags: {
    id: "tag-1",
    name: "First",
    category_id: "category-1",
    sort_order: 1000,
    tag_categories: {
      id: statusCategory.id,
      name: statusCategory.name,
      color: statusCategory.color,
      sort_order: statusCategory.sort_order,
      created_at: statusCategory.created_at,
    },
  },
};

const createdTag = {
  id: "tag-new",
  category_id: "category-1",
  name: "Emailed",
  sort_order: 3000,
  updated_at: "2026-07-31T00:00:00.000Z",
};

describe("ContactTagManager", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(unassignContactTag).mockResolvedValue(undefined);
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

  function renderManager({
    contactTagRows = [] as ContactTagRow[],
    persistToProvider = false,
  } = {}) {
    act(() => {
      root.render(
        <ContactTagManager
          contactId="contact-1"
          contactTagRows={contactTagRows}
          categories={categories}
          allTags={tags}
          persistToProvider={persistToProvider}
        />,
      );
    });
  }

  function getButton(name: string): HTMLButtonElement {
    const button = findButton(name);
    if (!button) {
      throw new Error(`Button not found: ${name}`);
    }
    return button;
  }

  function findButton(name: string): HTMLButtonElement | undefined {
    const button = [...document.body.querySelectorAll("button")].find(
      (item) =>
        item.textContent === name || item.getAttribute("aria-label") === name,
    );
    return button instanceof HTMLButtonElement ? button : undefined;
  }

  async function openPicker() {
    await act(async () => {
      getButton("Add tags").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
  }

  async function expandCategory(name: string) {
    await act(async () => {
      getButton(name).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  async function typeInto(input: HTMLInputElement | null, value: string) {
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

  function pickerSearchInput(): HTMLInputElement | null {
    return document.body.querySelector(
      '[data-testid="contact-tag-picker-search"]',
    );
  }

  it("renders only categories that have assigned tags", () => {
    renderManager({ contactTagRows: [assignedFirstRow] });

    expect(container.textContent).toContain("Status");
    expect(container.textContent).toContain("First");
    expect(container.textContent).not.toContain("26 Azores Nikon Project");
    expect(container.textContent).not.toContain("Second");
  });

  it("shows an empty hint plus the add button when the contact has no tags", () => {
    renderManager();

    expect(container.textContent).toContain("No tags yet.");
    expect(container.textContent).not.toContain("Status");
    expect(findButton("Add tags")).toBeDefined();
  });

  it("browses collapsed categories and reveals unassigned tags on expand", async () => {
    renderManager({ contactTagRows: [assignedFirstRow] });
    await openPicker();

    // Collapsed: category headers only.
    expect(findButton("Status")).toBeDefined();
    expect(findButton("26 Azores Nikon Project")).toBeDefined();
    expect(findButton("Second")).toBeUndefined();
    expect(findButton("Joining")).toBeUndefined();

    await expandCategory("Status");

    expect(findButton("Second")).toBeDefined();
    // "First" is assigned: shown as a card badge, hidden in the picker.
    expect(findButton("First")).toBeUndefined();
    // Other categories stay collapsed.
    expect(findButton("Joining")).toBeUndefined();
  });

  it("keeps other picker actions available while one tag assignment is syncing", async () => {
    vi.mocked(assignContactTag).mockImplementation(() => new Promise(() => {}));
    renderManager();
    await openPicker();
    await expandCategory("Status");

    await act(async () => {
      getButton("First").click();
      await Promise.resolve();
    });

    expect(assignContactTag).toHaveBeenCalledWith("contact-1", "tag-1");
    expect(getButton("Second").disabled).toBe(false);
  });

  it("persists an assignment through the provider mutator and keeps the picker open", async () => {
    vi.mocked(assignContactTag).mockResolvedValue(undefined);
    renderManager({ persistToProvider: true });
    await openPicker();
    await expandCategory("Status");

    await act(async () => {
      getButton("First").click();
      await Promise.resolve();
    });

    expect(mockAddOptimisticContactTags).toHaveBeenCalledWith(
      ["contact-1"],
      "tag-1",
    );
    expect(assignContactTag).toHaveBeenCalledWith("contact-1", "tag-1");
    expect(rollbackSpy).not.toHaveBeenCalled();
    expect(pickerSearchInput()).not.toBeNull();
  });

  it("rolls back the provider mutator when the assignment fails", async () => {
    vi.mocked(assignContactTag).mockRejectedValue(new Error("nope"));
    renderManager({ persistToProvider: true });
    await openPicker();
    await expandCategory("Status");

    await act(async () => {
      getButton("First").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAddOptimisticContactTags).toHaveBeenCalledWith(
      ["contact-1"],
      "tag-1",
    );
    expect(rollbackSpy).toHaveBeenCalled();
  });

  it("auto-expands matches when searching, matching category names", async () => {
    renderManager();
    await openPicker();
    await typeInto(pickerSearchInput(), "azores");

    expect(findButton("Joining")).toBeDefined();
    expect(findButton("First")).toBeUndefined();
    expect(findButton("Second")).toBeUndefined();
  });

  it("keeps a matched group visible after assigning its last matching tag", async () => {
    vi.mocked(assignContactTag).mockResolvedValue(undefined);
    renderManager({ persistToProvider: true });
    await openPicker();
    await typeInto(pickerSearchInput(), "first");

    await act(async () => {
      getButton("First").click();
      await Promise.resolve();
    });

    // The Status group header must not vanish under the cursor mid-add.
    // (Row-level hiding of the now-assigned tag comes from the provider's
    // updated rows, which this mocked harness doesn't propagate.)
    expect(assignContactTag).toHaveBeenCalledWith("contact-1", "tag-1");
    expect(document.body.textContent).toContain("Status");
    expect(pickerSearchInput()).not.toBeNull();
  });

  it("removes an assigned tag through the provider mutator", async () => {
    renderManager({
      contactTagRows: [assignedFirstRow],
      persistToProvider: true,
    });

    await act(async () => {
      getButton("Remove tag First").click();
      await Promise.resolve();
    });

    expect(mockRemoveOptimisticContactTags).toHaveBeenCalledWith(
      ["contact-1"],
      "tag-1",
    );
    expect(unassignContactTag).toHaveBeenCalledWith("contact-1", "tag-1");
  });

  it("quick-creates a tag and seeds the provider caches on success", async () => {
    vi.mocked(createAndAssignContactTag).mockResolvedValue({
      ok: true,
      tag: createdTag,
    });
    renderManager({ persistToProvider: true });
    await openPicker();
    await expandCategory("Status");

    await act(async () => {
      getButton("Create new tag in Status").click();
    });
    await typeInto(
      document.body.querySelector('[aria-label="New tag name in Status"]'),
      "Emailed",
    );
    await act(async () => {
      getButton("Add").click();
      await Promise.resolve();
    });

    expect(createAndAssignContactTag).toHaveBeenCalledWith(
      "contact-1",
      "category-1",
      "Emailed",
    );
    expect(mockAddOptimisticTag).toHaveBeenCalledWith(createdTag);
    expect(mockAddOptimisticContactTags).toHaveBeenCalledWith(
      ["contact-1"],
      "tag-new",
    );
  });

  it("shows an expected failure inline and keeps the create row open", async () => {
    vi.mocked(createAndAssignContactTag).mockResolvedValue({
      ok: false,
      code: "duplicate_name",
      message: "A tag with that name already exists in this category.",
    });
    renderManager({ persistToProvider: true });
    await openPicker();
    await expandCategory("Status");

    await act(async () => {
      getButton("Create new tag in Status").click();
    });
    await typeInto(
      document.body.querySelector('[aria-label="New tag name in Status"]'),
      "First",
    );
    await act(async () => {
      getButton("Add").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain(
      "A tag with that name already exists in this category.",
    );
    expect(
      document.body.querySelector('[aria-label="New tag name in Status"]'),
    ).not.toBeNull();
    expect(mockAddOptimisticTag).not.toHaveBeenCalled();
  });

  it("toasts created-but-not-assigned and makes the tag selectable", async () => {
    vi.mocked(createAndAssignContactTag).mockResolvedValue({
      ok: false,
      code: "created_not_assigned",
      message: 'Tag "Emailed" was created but could not be assigned.',
      tag: createdTag,
    });
    renderManager({ persistToProvider: true });
    await openPicker();
    await expandCategory("Status");

    await act(async () => {
      getButton("Create new tag in Status").click();
    });
    await typeInto(
      document.body.querySelector('[aria-label="New tag name in Status"]'),
      "Emailed",
    );
    await act(async () => {
      getButton("Add").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      'Tag "Emailed" was created but could not be assigned.',
    );
    expect(mockAddOptimisticTag).toHaveBeenCalledWith(createdTag);
    expect(mockAddOptimisticContactTags).not.toHaveBeenCalled();
  });

  it("collapses only the quick-create row on Escape, keeping the picker open", async () => {
    renderManager();
    await openPicker();
    await expandCategory("Status");

    await act(async () => {
      getButton("Create new tag in Status").click();
    });
    const input = document.body.querySelector(
      '[aria-label="New tag name in Status"]',
    );
    expect(input).not.toBeNull();

    await act(async () => {
      input?.dispatchEvent(
        // cancelable matters: Radix honors our preventDefault only on a
        // cancelable event, same as real browser keydowns.
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(
      document.body.querySelector('[aria-label="New tag name in Status"]'),
    ).toBeNull();
    expect(pickerSearchInput()).not.toBeNull();
  });
});
