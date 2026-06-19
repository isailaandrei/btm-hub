/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "./bulk-action-bar";
import { bulkAssignTag, bulkUnassignTag } from "./actions";

const mockAssignRollback = vi.fn();
const mockRemoveRollback = vi.fn();
const mockAddOptimisticContactTags = vi.fn(() => ({
  rollback: mockAssignRollback,
}));
const mockRemoveOptimisticContactTags = vi.fn(() => ({
  rollback: mockRemoveRollback,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("./actions", () => ({
  bulkAssignTag: vi.fn(),
  bulkUnassignTag: vi.fn(),
}));

vi.mock("../email/actions", () => ({
  loadEmailListsAction: vi.fn().mockResolvedValue({ lists: [] }),
  addEmailListMembersAction: vi.fn().mockResolvedValue({ added: 0 }),
  createEmailListAction: vi.fn(),
}));

vi.mock("../admin-data-provider", () => ({
  useAdminContactsData: () => ({
    addOptimisticContactTags: mockAddOptimisticContactTags,
    removeOptimisticContactTags: mockRemoveOptimisticContactTags,
  }),
}));

describe("BulkActionBar", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bulkAssignTag).mockResolvedValue({
      requested: 2,
      existing: 0,
      inserted: 2,
      alreadyAssigned: 0,
      skippedMissing: 0,
    });
    vi.mocked(bulkUnassignTag).mockResolvedValue(undefined);
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

  it("floats selection actions at the bottom of the viewport", () => {
    act(() => {
      root.render(
        <BulkActionBar
          selectedCount={2}
          selectedIds={["contact-1", "contact-2"]}
          tagCategories={[]}
          tags={[]}
          onClearSelection={vi.fn()}
          onSendEmail={vi.fn()}
        />,
      );
    });

    const bar = container.querySelector(
      '[data-testid="contacts-bulk-action-bar"]',
    );

    expect(bar?.textContent).toContain("2 selected");
    expect(bar?.className).toContain("fixed");
    expect(bar?.className).toContain("bottom-4");
    expect(bar?.className).toContain("z-50");
    expect(bar?.className).toContain("max-w-5xl");
  });

  it("applies optimistic bulk assign and rolls back on failure", async () => {
    vi.mocked(bulkAssignTag).mockRejectedValueOnce(new Error("failed"));
    renderWithTags();

    selectTag();
    const assignButton = buttonWithText("Assign");

    await act(async () => {
      assignButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAddOptimisticContactTags).toHaveBeenCalledWith(
      ["contact-1", "contact-2"],
      "tag-1",
    );
    expect(mockAssignRollback).toHaveBeenCalled();
  });

  it("applies optimistic bulk remove and rolls back on failure", async () => {
    vi.mocked(bulkUnassignTag).mockRejectedValueOnce(new Error("failed"));
    renderWithTags();

    selectTag();
    const removeButton = buttonWithText("Remove");

    await act(async () => {
      removeButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRemoveOptimisticContactTags).toHaveBeenCalledWith(
      ["contact-1", "contact-2"],
      "tag-1",
    );
    expect(mockRemoveRollback).toHaveBeenCalled();
  });

  function renderWithTags() {
    act(() => {
      root.render(
        <BulkActionBar
          selectedCount={2}
          selectedIds={["contact-1", "contact-2"]}
          tagCategories={[
            {
              id: "category-1",
              name: "Status",
              color: "blue",
              sort_order: 1000,
              created_at: "2026-06-01T10:00:00.000Z",
              updated_at: "2026-06-01T10:00:00.000Z",
            },
          ]}
          tags={[
            {
              id: "tag-1",
              category_id: "category-1",
              name: "Active",
              sort_order: 1000,
              updated_at: "2026-06-01T10:00:00.000Z",
            },
          ]}
          onClearSelection={vi.fn()}
        />,
      );
    });
  }

  function selectTag() {
    const categorySelect = container.querySelector("select");
    if (!categorySelect) throw new Error("category select missing");
    act(() => {
      categorySelect.value = "category-1";
      categorySelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const tagSelect = container.querySelectorAll("select")[1];
    if (!tagSelect) throw new Error("tag select missing");
    act(() => {
      tagSelect.value = "tag-1";
      tagSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function buttonWithText(text: string): HTMLButtonElement {
    const button = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes(text),
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`button not found: ${text}`);
    }
    return button;
  }
});
