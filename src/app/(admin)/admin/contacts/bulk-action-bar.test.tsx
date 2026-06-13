/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "./bulk-action-bar";

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

describe("BulkActionBar", () => {
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
});
