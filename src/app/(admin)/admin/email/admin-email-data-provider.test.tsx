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
const mockLoadEmailListsAction = vi.fn();
const mockLoadEmailSegmentsAction = vi.fn();
const mockLoadAudienceTagsAction = vi.fn();
const mockLoadEmailExclusionsAction = vi.fn();
const mockLoadAudienceContactsAction = vi.fn();
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
  loadEmailListsAction: mockLoadEmailListsAction,
  loadEmailSegmentsAction: mockLoadEmailSegmentsAction,
  loadAudienceTagsAction: mockLoadAudienceTagsAction,
  loadEmailExclusionsAction: mockLoadEmailExclusionsAction,
  loadAudienceContactsAction: mockLoadAudienceContactsAction,
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

function ListsConsumer() {
  const { lists, ensureLists } = useAdminEmailData();

  useEffect(() => {
    void ensureLists({ quiet: true });
  }, [ensureLists]);

  return <output>{lists?.[0]?.id ?? "loading"}</output>;
}

function ListsToggleShell() {
  const [showConsumer, setShowConsumer] = useState(true);

  return (
    <AdminEmailDataProvider>
      <button type="button" onClick={() => setShowConsumer((value) => !value)}>
        Toggle
      </button>
      {showConsumer ? <ListsConsumer /> : <span>Hidden</span>}
    </AdminEmailDataProvider>
  );
}

function ExclusionsRefreshConsumer() {
  const { exclusions, ensureExclusions, refreshExclusions } =
    useAdminEmailData();

  useEffect(() => {
    void ensureExclusions({ quiet: true });
  }, [ensureExclusions]);

  return (
    <>
      <output>{exclusions?.[0]?.id ?? "loading"}</output>
      <button
        type="button"
        onClick={() => void refreshExclusions({ quiet: true })}
      >
        Refresh
      </button>
    </>
  );
}

function ExclusionsRefreshShell() {
  return (
    <AdminEmailDataProvider>
      <ExclusionsRefreshConsumer />
    </AdminEmailDataProvider>
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
    mockLoadEmailListsAction.mockResolvedValue({
      lists: [{ id: "list-1", name: "List 1", memberCount: 0 }],
    });
    mockLoadEmailSegmentsAction.mockResolvedValue({
      segments: [{ id: "segment-1", name: "Segment 1" }],
    });
    mockLoadAudienceTagsAction.mockResolvedValue({
      categories: [{ id: "cat-1", name: "Category 1" }],
      tags: [{ id: "tag-1", name: "Tag 1" }],
    });
    mockLoadEmailExclusionsAction.mockResolvedValue({
      exclusions: [{ id: "exclusion-1", email: "blocked@example.com" }],
    });
    mockLoadAudienceContactsAction.mockResolvedValue({
      contacts: [{ id: "contact-1", name: "Contact 1", email: "c1@example.com" }],
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

  it("loads audience lists once across consumer remounts", async () => {
    await act(async () => {
      root.render(<ListsToggleShell />);
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe("list-1");
    expect(mockLoadEmailListsAction).toHaveBeenCalledTimes(1);

    // Unmount then remount the consumer — ensure must NOT refetch.
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

    expect(container.querySelector("output")?.textContent).toBe("list-1");
    expect(mockLoadEmailListsAction).toHaveBeenCalledTimes(1);
    // Audience resources are independent — nothing else was loaded.
    expect(mockLoadEmailSegmentsAction).not.toHaveBeenCalled();
    expect(mockLoadEmailExclusionsAction).not.toHaveBeenCalled();
    expect(mockLoadAudienceContactsAction).not.toHaveBeenCalled();
  });

  it("forces a refetch of exclusions on explicit refresh", async () => {
    mockLoadEmailExclusionsAction
      .mockResolvedValueOnce({
        exclusions: [{ id: "exclusion-1", email: "a@example.com" }],
      })
      .mockResolvedValueOnce({
        exclusions: [{ id: "exclusion-2", email: "b@example.com" }],
      });

    await act(async () => {
      root.render(<ExclusionsRefreshShell />);
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe("exclusion-1");
    expect(mockLoadEmailExclusionsAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe("exclusion-2");
    expect(mockLoadEmailExclusionsAction).toHaveBeenCalledTimes(2);
  });
});
