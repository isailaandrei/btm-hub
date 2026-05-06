/**
 * @vitest-environment jsdom
 */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTemplate } from "@/types/database";

const mockEnsureEmailStudioData = vi.fn();
const mockRefreshEmailStudioData = vi.fn();
const mockSetEmailSends = vi.fn();
const mockSetEmailTemplates = vi.fn();
const mockEmailComposerMount = vi.fn();
const mockEmailComposerUnmount = vi.fn();
const mockTemplateEditorMount = vi.fn();
const mockTemplateEditorUnmount = vi.fn();

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
  useAdminEmailData: () => ({
    templates: [
      {
        id: "template-1",
        name: "Template 1",
        current_version_id: "version-1",
      } as EmailTemplate,
    ],
    sends: [],
    emailError: null,
    ensureEmailStudioData: mockEnsureEmailStudioData,
    refreshEmailStudioData: mockRefreshEmailStudioData,
    setEmailSends: mockSetEmailSends,
    setEmailTemplates: mockSetEmailTemplates,
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

vi.mock("./templates/template-editor", () => ({
  TemplateEditor: () => {
    useEffect(() => {
      mockTemplateEditorMount();
      return () => mockTemplateEditorUnmount();
    }, []);

    return <section data-testid="template-editor">Templates</section>;
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
    mockEnsureEmailStudioData.mockResolvedValue(undefined);
    mockRefreshEmailStudioData.mockResolvedValue(undefined);
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

  it("keeps compose and templates mounted after first visit", () => {
    act(() => {
      root.render(<EmailStudio selectedContactIds={[]} />);
    });

    expect(mockEmailComposerMount).toHaveBeenCalledTimes(1);
    expect(mockTemplateEditorMount).not.toHaveBeenCalled();

    clickEmailTab("Templates");

    expect(mockEmailComposerUnmount).not.toHaveBeenCalled();
    expect(mockTemplateEditorMount).toHaveBeenCalledTimes(1);

    clickEmailTab("Compose");

    expect(mockEmailComposerMount).toHaveBeenCalledTimes(1);
    expect(mockEmailComposerUnmount).not.toHaveBeenCalled();
    expect(mockTemplateEditorUnmount).not.toHaveBeenCalled();
  });
});
