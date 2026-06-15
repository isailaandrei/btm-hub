/**
 * @vitest-environment jsdom
 */

import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailSend, EmailTemplate } from "@/types/database";

const mockLoadEmailTemplatesAction = vi.fn();
const mockLoadEmailSendsAction = vi.fn();
const mockLoadEmailManualRecipientsAction = vi.fn();
const mockGetTemplateVersionForEditorAction = vi.fn();
const mockToastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
  },
}));

vi.mock("./actions", () => ({
  loadEmailManualRecipientsAction: mockLoadEmailManualRecipientsAction,
  loadEmailTemplatesAction: mockLoadEmailTemplatesAction,
  loadEmailSendsAction: mockLoadEmailSendsAction,
}));

vi.mock("./templates/actions", () => ({
  getTemplateVersionForEditorAction: mockGetTemplateVersionForEditorAction,
}));

const { AdminEmailDataProvider, useAdminEmailData } = await import(
  "./admin-email-data-provider"
);

function makeTemplate(id: string): EmailTemplate {
  return {
    id,
    name: `Template ${id}`,
  } as EmailTemplate;
}

function makeSend(id: string): EmailSend {
  return {
    id,
    name: `Send ${id}`,
  } as EmailSend;
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function EmailDataConsumer() {
  const { templates, sends, ensureEmailTemplates } = useAdminEmailData();

  useEffect(() => {
    void ensureEmailTemplates({ quiet: true });
  }, [ensureEmailTemplates]);

  return (
    <output>
      {templates?.length ?? "loading"}:{sends?.length ?? "loading"}
    </output>
  );
}

function RefreshConsumer() {
  const { templates, ensureEmailTemplates, refreshEmailTemplates } =
    useAdminEmailData();

  useEffect(() => {
    void ensureEmailTemplates({ quiet: true });
  }, [ensureEmailTemplates]);

  return (
    <>
      <output>{templates?.[0]?.id ?? "loading"}</output>
      <button
        type="button"
        onClick={() => void refreshEmailTemplates({ quiet: true })}
      >
        Refresh
      </button>
    </>
  );
}

function SendsConsumer() {
  const { sends, ensureEmailSends } = useAdminEmailData();

  return (
    <>
      <output>{sends?.[0]?.id ?? "no-sends"}</output>
      <button
        type="button"
        onClick={() => void ensureEmailSends({ quiet: true })}
      >
        Load sends
      </button>
    </>
  );
}

function ManualRecipientsConsumer() {
  const { manualRecipients, ensureManualRecipients } = useAdminEmailData();

  return (
    <>
      <output>{manualRecipients?.[0]?.email ?? "no-recipients"}</output>
      <button
        type="button"
        onClick={() => void ensureManualRecipients({ quiet: true })}
      >
        Load recipients
      </button>
    </>
  );
}

function TemplateVersionConsumer() {
  const {
    templateVersionsById,
    ensureTemplateVersion,
  } = useAdminEmailData();

  return (
    <>
      <output>
        {Object.keys(templateVersionsById).sort().join(",") || "none"}
      </output>
      <button
        type="button"
        onClick={() => void ensureTemplateVersion("version-2", { quiet: true })}
      >
        Load version
      </button>
    </>
  );
}

function ToggleShell() {
  const [showConsumer, setShowConsumer] = useState(true);

  return (
    <AdminEmailDataProvider>
      <button type="button" onClick={() => setShowConsumer((value) => !value)}>
        Toggle
      </button>
      {showConsumer ? <EmailDataConsumer /> : <span>Hidden</span>}
    </AdminEmailDataProvider>
  );
}

function RefreshShell() {
  return (
    <AdminEmailDataProvider>
      <RefreshConsumer />
    </AdminEmailDataProvider>
  );
}

function SendsShell() {
  return (
    <AdminEmailDataProvider>
      <SendsConsumer />
    </AdminEmailDataProvider>
  );
}

function ManualRecipientsShell() {
  return (
    <AdminEmailDataProvider>
      <ManualRecipientsConsumer />
    </AdminEmailDataProvider>
  );
}

function TemplateVersionShell() {
  return (
    <AdminEmailDataProvider>
      <TemplateVersionConsumer />
    </AdminEmailDataProvider>
  );
}

describe("AdminEmailDataProvider", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockLoadEmailTemplatesAction.mockResolvedValue({
      templates: [makeTemplate("template-1")],
      templateVersionsById: {
        "version-1": { builderJson: { type: "doc", content: [] } },
      },
    });
    mockLoadEmailSendsAction.mockResolvedValue({
      sends: [makeSend("send-1")],
    });
    mockLoadEmailManualRecipientsAction.mockResolvedValue({
      manualRecipients: [{ id: "manual-1", email: "test@example.com" }],
    });
    mockGetTemplateVersionForEditorAction.mockResolvedValue({
      builderJson: { type: "doc", content: [{ type: "paragraph" }] },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("loads email templates once across consumer remounts without loading sends", async () => {
    await act(async () => {
      root.render(<ToggleShell />);
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe("1:loading");
    expect(mockLoadEmailTemplatesAction).toHaveBeenCalledTimes(1);
    expect(mockLoadEmailSendsAction).not.toHaveBeenCalled();
    expect(mockLoadEmailManualRecipientsAction).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await act(async () => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe("1:loading");
    expect(mockLoadEmailTemplatesAction).toHaveBeenCalledTimes(1);
    expect(mockLoadEmailSendsAction).not.toHaveBeenCalled();
    expect(mockLoadEmailManualRecipientsAction).not.toHaveBeenCalled();
  });

  it("allows explicit template refresh after data has already loaded", async () => {
    mockLoadEmailTemplatesAction
      .mockResolvedValueOnce({
        templates: [makeTemplate("template-1")],
        templateVersionsById: {},
      })
      .mockResolvedValueOnce({
        templates: [makeTemplate("template-2")],
        templateVersionsById: {},
      });

    await act(async () => {
      root.render(<RefreshShell />);
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe("template-1");

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe("template-2");
    expect(mockLoadEmailTemplatesAction).toHaveBeenCalledTimes(2);
  });

  it("loads sends only when requested", async () => {
    await act(async () => {
      root.render(<SendsShell />);
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe("no-sends");
    expect(mockLoadEmailSendsAction).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe("send-1");
    expect(mockLoadEmailSendsAction).toHaveBeenCalledTimes(1);
  });

  it("loads manual recipients only when requested", async () => {
    await act(async () => {
      root.render(<ManualRecipientsShell />);
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe("no-recipients");
    expect(mockLoadEmailManualRecipientsAction).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe(
      "test@example.com",
    );
    expect(mockLoadEmailManualRecipientsAction).toHaveBeenCalledTimes(1);
  });

  it("caches individual template versions", async () => {
    await act(async () => {
      root.render(<TemplateVersionShell />);
    });

    expect(container.querySelector("output")?.textContent).toBe("none");

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe("version-2");
    expect(mockGetTemplateVersionForEditorAction).toHaveBeenCalledTimes(1);
  });
});
