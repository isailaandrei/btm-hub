/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLoad = vi.fn();
const mockExclude = vi.fn();
const mockAllow = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../actions", () => ({
  loadContactEmailSection: mockLoad,
  excludeContactFromEmail: mockExclude,
  allowContactEmail: mockAllow,
}));

const { ContactEmailSection } = await import("./contact-email-section");

const CONTACT_ID = "550e8400-e29b-41d4-a716-446655440001";

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ContactEmailSection", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockLoad.mockReset();
    mockExclude.mockReset().mockResolvedValue(undefined);
    mockAllow.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("loads its own status on mount", async () => {
    mockLoad.mockResolvedValue({ excluded: false, reason: null });

    await act(async () => {
      root.render(<ContactEmailSection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    expect(mockLoad).toHaveBeenCalledWith(CONTACT_ID);
    expect(container.textContent).toContain("This contact can receive email");
  });

  it("re-reads after a successful exclude — the session cache can't refresh on its own", async () => {
    mockLoad
      .mockResolvedValueOnce({ excluded: false, reason: null })
      .mockResolvedValueOnce({ excluded: true, reason: "manual" });

    await act(async () => {
      root.render(<ContactEmailSection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    const excludeButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Exclude from all email"),
    );
    if (!excludeButton) throw new Error("Missing exclude button");

    await act(async () => {
      excludeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(mockExclude).toHaveBeenCalledWith(CONTACT_ID);
    // onChanged → loadData fired a second read, flipping the card to excluded.
    expect(mockLoad).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Excluded from all email");
  });

  it("surfaces a load error with a retry instead of faking a status", async () => {
    mockLoad.mockRejectedValueOnce(new Error("boom"));

    await act(async () => {
      root.render(<ContactEmailSection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    expect(container.textContent).toContain("boom");
    expect(
      [...container.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "Retry",
      ),
    ).toBe(true);
  });
});
