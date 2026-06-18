/**
 * @vitest-environment jsdom
 */

import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTemplate } from "@/types/database";

const mockEnsureEmailTemplates = vi.fn();
const mockEnsureEmailSends = vi.fn();
const mockEnsureManualRecipients = vi.fn();
const mockRefreshEmailSends = vi.fn();
const mockEnsureTemplateVersion = vi.fn();
const mockSetEmailSends = vi.fn();
const mockSetEmailTemplates = vi.fn();
const mockSetManualRecipients = vi.fn();
const mockEmailComposerMount = vi.fn();
const mockEmailComposerUnmount = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("./actions", () => ({
  deleteEmailSendAction: vi.fn(),
  getEmailSendDiagnosticsAction: vi.fn(),
}));

vi.mock("./admin-email-data-provider", () => ({
  AdminEmailDataProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useAdminEmailData: () => ({
    templates: [
      {
        id: "template-1",
        name: "Template 1",
        current_version_id: "version-1",
      } as EmailTemplate,
    ],
    sends: [],
    manualRecipients: [],
    templateVersionsById: {},
    emailError: null,
    ensureEmailTemplates: mockEnsureEmailTemplates,
    ensureEmailSends: mockEnsureEmailSends,
    ensureManualRecipients: mockEnsureManualRecipients,
    refreshEmailSends: mockRefreshEmailSends,
    ensureTemplateVersion: mockEnsureTemplateVersion,
    setEmailSends: mockSetEmailSends,
    setEmailTemplates: mockSetEmailTemplates,
    setManualRecipients: mockSetManualRecipients,
  }),
}));

vi.mock("./compose/email-composer", () => ({
  EmailComposer: () => {
    useEffect(() => {
      mockEmailComposerMount();
      return () => mockEmailComposerUnmount();
    }, []);

    return <section data-testid="email-composer">Compose</section>;
  },
}));

const { EmailStudio } = await import("./email-studio");

describe("EmailStudio", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockEnsureEmailTemplates.mockReset().mockResolvedValue(undefined);
    mockEnsureEmailSends.mockReset().mockResolvedValue(undefined);
    mockEnsureManualRecipients.mockReset().mockResolvedValue(undefined);
    mockRefreshEmailSends.mockReset().mockResolvedValue(undefined);
    mockEnsureTemplateVersion.mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function clickEmailTab(label: string) {
    const button = [...container.querySelectorAll("button")].find(
      (element) => element.textContent === label,
    );
    if (!button) throw new Error(`Missing ${label} tab`);

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("renders email mode buttons as an icon segmented control", () => {
    act(() => {
      root.render(<EmailStudio selectedContactIds={[]} />);
    });

    const tabGroup = container.querySelector('[data-testid="email-studio-tabs"]');
    expect(tabGroup?.className).toContain("rounded-full");

    const buttons = [
      ...container.querySelectorAll('[data-testid="email-studio-tab"]'),
    ];

    expect(buttons.map((button) => button.textContent)).toEqual([
      "Compose",
      "Sent emails",
      "Audiences",
    ]);
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute("data-state")).toBe("active");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[0].querySelector("svg")).not.toBeNull();
    expect(buttons[1].getAttribute("data-state")).toBe("inactive");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
    expect(buttons[1].querySelector("svg")).not.toBeNull();
  });

  it("keeps compose mounted when switching to the sent tab and back", () => {
    act(() => {
      root.render(<EmailStudio selectedContactIds={[]} />);
    });

    expect(mockEmailComposerMount).toHaveBeenCalledTimes(1);

    clickEmailTab("Sent emails");
    clickEmailTab("Compose");

    // Compose is hidden, never unmounted, so editor state survives tab switches.
    expect(mockEmailComposerMount).toHaveBeenCalledTimes(1);
    expect(mockEmailComposerUnmount).not.toHaveBeenCalled();
  });

  it("loads compose data on mount and defers sends until the sent tab is selected", () => {
    act(() => {
      root.render(<EmailStudio selectedContactIds={[]} />);
    });

    expect(mockEnsureEmailTemplates).toHaveBeenCalledWith({ quiet: true });
    expect(mockEnsureManualRecipients).toHaveBeenCalledWith({ quiet: true });
    expect(mockEnsureEmailSends).not.toHaveBeenCalled();

    clickEmailTab("Sent emails");

    expect(mockEnsureEmailSends).toHaveBeenCalledWith({ quiet: true });
  });
});
