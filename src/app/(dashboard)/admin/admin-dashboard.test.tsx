/**
 * @vitest-environment jsdom
 */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockEmailStudioMount = vi.fn();
const mockEmailStudioUnmount = vi.fn();
const mockTagsPanelMount = vi.fn();
const mockTagsPanelUnmount = vi.fn();
const mockTasksPanelMount = vi.fn();
const mockTasksPanelUnmount = vi.fn();
let dynamicCallIndex = 0;

vi.mock("next/dynamic", () => ({
  default: () => {
    const callIndex = dynamicCallIndex;
    dynamicCallIndex += 1;
    return function MockDynamic() {
      useEffect(() => {
        if (callIndex === 0) {
          mockTagsPanelMount();
        } else if (callIndex === 1) {
          mockEmailStudioMount();
        } else {
          mockTasksPanelMount();
        }
        return () => {
          if (callIndex === 0) {
            mockTagsPanelUnmount();
          } else if (callIndex === 1) {
            mockEmailStudioUnmount();
          } else {
            mockTasksPanelUnmount();
          }
        };
      }, []);

      return (
        <section
          data-testid={
            callIndex === 0
              ? "tags-panel"
              : callIndex === 1
                ? "email-panel"
                : "tasks-panel"
          }
        >
          Dynamic panel
        </section>
      );
    };
  },
}));

vi.mock("./contacts/contacts-panel", () => ({
  ContactsPanel: () => <section>Contacts</section>,
}));

vi.mock("./tags/tags-panel", () => ({
  TagsPanel: () => <section>Tags</section>,
}));

vi.mock("./tasks/tasks-panel", () => ({
  TasksPanel: () => <section>Tasks panel</section>,
}));

const { AdminDashboard } = await import("./admin-dashboard");

describe("AdminDashboard", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    mockEmailStudioMount.mockClear();
    mockEmailStudioUnmount.mockClear();
    mockTagsPanelMount.mockClear();
    mockTagsPanelUnmount.mockClear();
    mockTasksPanelMount.mockClear();
    mockTasksPanelUnmount.mockClear();
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
    expect(container.querySelector("[data-testid='email-panel']")).not.toBeNull();

    clickTab("Contacts");

    expect(mockEmailStudioUnmount).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid='email-panel']")).not.toBeNull();

    clickTab("Email");

    expect(mockEmailStudioMount).toHaveBeenCalledTimes(1);
    expect(mockEmailStudioUnmount).not.toHaveBeenCalled();
  });

  it("renders the tasks tab without mounting email first", () => {
    act(() => {
      root.render(<AdminDashboard />);
    });

    clickTab("Tasks");

    expect(container.textContent).toContain("Dynamic panel");
    expect(mockTasksPanelMount).toHaveBeenCalledTimes(1);
    expect(mockEmailStudioMount).not.toHaveBeenCalled();
  });

  it("does not mount the tags panel before the tags tab is opened", () => {
    act(() => {
      root.render(<AdminDashboard />);
    });

    expect(mockTagsPanelMount).not.toHaveBeenCalled();

    clickTab("Tags");

    expect(mockTagsPanelMount).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-testid='tags-panel']")).not.toBeNull();
  });

  it("keeps the tasks panel mounted after its first visit", () => {
    act(() => {
      root.render(<AdminDashboard />);
    });

    clickTab("Tasks");

    expect(mockTasksPanelMount).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-testid='tasks-panel']")).not.toBeNull();

    clickTab("Contacts");

    expect(mockTasksPanelUnmount).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid='tasks-panel']")).not.toBeNull();

    clickTab("Tasks");

    expect(mockTasksPanelMount).toHaveBeenCalledTimes(1);
    expect(mockTasksPanelUnmount).not.toHaveBeenCalled();
  });
});
