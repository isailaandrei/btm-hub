/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SiteMenuPoc } from "./site-menu-poc";

describe("SiteMenuPoc", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders all three levels of the sitemap", async () => {
    await act(async () => {
      root.render(<SiteMenuPoc />);
    });

    // Level 1, level 2, level 3 all present in the DOM.
    expect(container.textContent).toContain("Academy"); // L1
    expect(container.textContent).toContain("Experiences"); // L2
    expect(container.textContent).toContain("Maldives"); // L3 (trip)
    expect(container.textContent).toContain("Industries"); // L2 (Creative)
    expect(container.textContent).toContain("Pharmaceutical"); // L3 (industry)
  });

  it("toggles the menu open via the trigger", async () => {
    await act(async () => {
      root.render(<SiteMenuPoc />);
    });

    const trigger = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Menu"),
    );
    if (!trigger) throw new Error("Missing menu trigger");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
