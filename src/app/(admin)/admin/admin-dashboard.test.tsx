/**
 * @vitest-environment jsdom
 */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockEmailStudioMount = vi.fn();
const mockEmailStudioUnmount = vi.fn();
const mockTasksPanelMount = vi.fn();
const mockTasksPanelUnmount = vi.fn();
const mockAdminAiMount = vi.fn();
const mockAdminAiUnmount = vi.fn();
const mockRouterPush = vi.fn();
let dynamicCallIndex = 0;
let currentTabParam: string | null = null;

vi.mock("next/dynamic", () => ({
  default: () => {
    function MockEmailStudio({
      selectedContactIds = [],
    }: {
      selectedContactIds?: string[];
    }) {
      useEffect(() => {
        mockEmailStudioMount();
        return () => {
          mockEmailStudioUnmount();
        };
      }, []);

      return (
        <section data-testid="email-panel">
          Dynamic panel {selectedContactIds.join(",")}
        </section>
      );
    }

    function MockTasksPanel() {
      useEffect(() => {
        mockTasksPanelMount();
        return () => {
          mockTasksPanelUnmount();
        };
      }, []);

      return <section data-testid="tasks-panel">Dynamic panel</section>;
    }

    function MockAdminAiPanel() {
      useEffect(() => {
        mockAdminAiMount();
        return () => {
          mockAdminAiUnmount();
        };
      }, []);

      return <section data-testid="ai-panel">Dynamic panel</section>;
    }

    const dynamicComponents = [
      MockEmailStudio,
      MockTasksPanel,
      MockAdminAiPanel,
    ];
    const Component = dynamicComponents[dynamicCallIndex] ?? MockAdminAiPanel;
    dynamicCallIndex += 1;
    return Component;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => new URLSearchParams(
    currentTabParam ? { tab: currentTabParam } : undefined,
  ),
}));

vi.mock("./contacts/contacts-panel", () => ({
  ContactsPanel: ({
    onSendEmail,
  }: {
    onSendEmail?: (contactIds: string[]) => void;
  }) => (
    <section>
      Contacts
      <button
        type="button"
        onClick={() => onSendEmail?.(["contact-1", "contact-2"])}
      >
        Send selected email
      </button>
    </section>
  ),
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
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    currentTabParam = null;
    mockEmailStudioMount.mockClear();
    mockEmailStudioUnmount.mockClear();
    mockTasksPanelMount.mockClear();
    mockTasksPanelUnmount.mockClear();
    mockAdminAiMount.mockClear();
    mockAdminAiUnmount.mockClear();
    mockRouterPush.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function renderDashboard(tab: string | null = currentTabParam) {
    currentTabParam = tab;
    await act(async () => {
      root.render(<AdminDashboard />);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function clickButton(label: string) {
    const button = [...container.querySelectorAll("button")].find((element) =>
      element.textContent?.includes(label),
    );
    if (!button) throw new Error(`Missing ${label} button`);

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("keeps the email studio mounted after its first query-param visit", async () => {
    await renderDashboard();
    await renderDashboard("email");

    expect(mockEmailStudioMount).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-testid='email-panel']")).not.toBeNull();

    await renderDashboard(null);

    expect(mockEmailStudioUnmount).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid='email-panel']")).not.toBeNull();

    await renderDashboard("email");

    expect(mockEmailStudioMount).toHaveBeenCalledTimes(1);
    expect(mockEmailStudioUnmount).not.toHaveBeenCalled();
  });

  it("renders the tasks tab without mounting email first", async () => {
    await renderDashboard();
    await renderDashboard("tasks");

    expect(container.textContent).toContain("Dynamic panel");
    expect(mockTasksPanelMount).toHaveBeenCalledTimes(1);
    expect(mockEmailStudioMount).not.toHaveBeenCalled();
  });

  it("keeps the tasks panel mounted after its first query-param visit", async () => {
    await renderDashboard();
    await renderDashboard("tasks");

    expect(mockTasksPanelMount).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-testid='tasks-panel']")).not.toBeNull();

    await renderDashboard(null);

    expect(mockTasksPanelUnmount).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid='tasks-panel']")).not.toBeNull();

    await renderDashboard("tasks");

    expect(mockTasksPanelMount).toHaveBeenCalledTimes(1);
    expect(mockTasksPanelUnmount).not.toHaveBeenCalled();
  });

  it("hands selected contacts to email studio by navigating to the email tab", async () => {
    await renderDashboard();

    clickButton("Send selected email");
    await renderDashboard("email");

    expect(mockRouterPush).toHaveBeenCalledWith("/admin?tab=email");
    expect(
      container.querySelector("[data-testid='email-panel']")?.textContent,
    ).toContain("contact-1,contact-2");
  });

  it("clears selected contacts when email is opened manually later", async () => {
    await renderDashboard();
    clickButton("Send selected email");
    await renderDashboard("email");

    expect(
      container.querySelector("[data-testid='email-panel']")?.textContent,
    ).toContain("contact-1,contact-2");

    await renderDashboard(null);
    await renderDashboard("email");

    expect(
      container.querySelector("[data-testid='email-panel']")?.textContent,
    ).not.toContain("contact-1");
  });

  it("warns and falls back to contacts for an invalid explicit tab", async () => {
    await renderDashboard("definitely-not-real");

    expect(console.warn).toHaveBeenCalledWith(
      "Invalid admin dashboard tab: definitely-not-real",
    );
    expect(container.textContent).toContain("Contacts");
  });
});
