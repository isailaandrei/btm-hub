/**
 * @vitest-environment jsdom
 */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockEmailStudioMount = vi.fn();
const mockEmailStudioUnmount = vi.fn();

vi.mock("next/dynamic", () => ({
  default: () => function MockEmailStudio() {
    useEffect(() => {
      mockEmailStudioMount();
      return () => mockEmailStudioUnmount();
    }, []);

    return <section data-testid="email-studio">Email studio</section>;
  },
}));

vi.mock("./contacts/contacts-panel", () => ({
  ContactsPanel: () => <section>Contacts</section>,
}));

vi.mock("./tags/tags-panel", () => ({
  TagsPanel: () => <section>Tags</section>,
}));

const { AdminDashboard } = await import("./admin-dashboard");

describe("AdminDashboard", () => {
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

  function clickTab(label: string) {
    const button = [...container.querySelectorAll("button")].find(
      (element) => element.textContent === label,
    );
    if (!button) throw new Error(`Missing ${label} tab`);

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("keeps the email studio mounted after its first visit", () => {
    act(() => {
      root.render(<AdminDashboard />);
    });

    clickTab("Email");

    expect(mockEmailStudioMount).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-testid='email-studio']")).not.toBeNull();

    clickTab("Contacts");

    expect(mockEmailStudioUnmount).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid='email-studio']")).not.toBeNull();

    clickTab("Email");

    expect(mockEmailStudioMount).toHaveBeenCalledTimes(1);
    expect(mockEmailStudioUnmount).not.toHaveBeenCalled();
  });
});
