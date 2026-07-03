/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignContactTag, unassignContactTag } from "../actions";
import { ContactTagManager } from "./contact-tag-manager";

const rollbackSpy = vi.fn();
const mockAddOptimisticContactTags = vi.fn(() => ({ rollback: rollbackSpy }));
const mockRemoveOptimisticContactTags = vi.fn(() => ({ rollback: rollbackSpy }));

vi.mock("../../admin-data-provider", () => ({
  useAdminContactsData: () => ({
    addOptimisticContactTags: mockAddOptimisticContactTags,
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
  unassignContactTag: vi.fn(),
}));

const category = {
  id: "category-1",
  name: "Status",
  color: "blue",
  sort_order: 1000,
  created_at: "2026-06-01T10:00:00.000Z",
};

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
];

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

  it("keeps other tag actions available while one tag assignment is syncing", async () => {
    vi.mocked(assignContactTag).mockImplementation(() => new Promise(() => {}));

    act(() => {
      root.render(
        <ContactTagManager
          contactId="contact-1"
          contactTagRows={[]}
          categories={[category]}
          allTags={tags}
        />,
      );
    });

    act(() => {
      getButton("Add tag to Status").click();
    });

    await act(async () => {
      getButton("First").click();
      await Promise.resolve();
    });

    expect(assignContactTag).toHaveBeenCalledWith("contact-1", "tag-1");
    expect(getButton("Second").disabled).toBe(false);
    expect(getButton("Add tag to Status").disabled).toBe(false);
  });

  it("persists an assignment through the provider mutator when provider-backed", async () => {
    vi.mocked(assignContactTag).mockResolvedValue(undefined);

    act(() => {
      root.render(
        <ContactTagManager
          contactId="contact-1"
          contactTagRows={[]}
          categories={[category]}
          allTags={tags}
          persistToProvider
        />,
      );
    });

    act(() => {
      getButton("Add tag to Status").click();
    });

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
  });

  it("rolls back the provider mutator when the assignment fails", async () => {
    vi.mocked(assignContactTag).mockRejectedValue(new Error("nope"));

    act(() => {
      root.render(
        <ContactTagManager
          contactId="contact-1"
          contactTagRows={[]}
          categories={[category]}
          allTags={tags}
          persistToProvider
        />,
      );
    });

    act(() => {
      getButton("Add tag to Status").click();
    });

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

  function getButton(name: string): HTMLButtonElement {
    const button = [...container.querySelectorAll("button")].find(
      (item) =>
        item.textContent === name || item.getAttribute("aria-label") === name,
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Button not found: ${name}`);
    }
    return button;
  }
});
