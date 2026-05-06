/**
 * @vitest-environment jsdom
 */

import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailSend, EmailTemplate } from "@/types/database";

const mockLoadEmailStudioDataAction = vi.fn();
const mockToastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
  },
}));

vi.mock("./actions", () => ({
  loadEmailStudioDataAction: mockLoadEmailStudioDataAction,
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
  const { templates, sends, ensureEmailStudioData } = useAdminEmailData();

  useEffect(() => {
    void ensureEmailStudioData({ quiet: true });
  }, [ensureEmailStudioData]);

  return (
    <output>
      {templates?.length ?? "loading"}:{sends?.length ?? "loading"}
    </output>
  );
}

function RefreshConsumer() {
  const { templates, ensureEmailStudioData, refreshEmailStudioData } =
    useAdminEmailData();

  useEffect(() => {
    void ensureEmailStudioData({ quiet: true });
  }, [ensureEmailStudioData]);

  return (
    <>
      <output>{templates?.[0]?.id ?? "loading"}</output>
      <button
        type="button"
        onClick={() => void refreshEmailStudioData({ quiet: true })}
      >
        Refresh
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

describe("AdminEmailDataProvider", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockLoadEmailStudioDataAction.mockResolvedValue({
      templates: [makeTemplate("template-1")],
      sends: [makeSend("send-1")],
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("loads email studio data once across consumer remounts", async () => {
    await act(async () => {
      root.render(<ToggleShell />);
    });
    await flushAsyncWork();

    expect(container.querySelector("output")?.textContent).toBe("1:1");
    expect(mockLoadEmailStudioDataAction).toHaveBeenCalledTimes(1);

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

    expect(container.querySelector("output")?.textContent).toBe("1:1");
    expect(mockLoadEmailStudioDataAction).toHaveBeenCalledTimes(1);
  });

  it("allows explicit refresh after data has already loaded", async () => {
    mockLoadEmailStudioDataAction
      .mockResolvedValueOnce({
        templates: [makeTemplate("template-1")],
        sends: [makeSend("send-1")],
      })
      .mockResolvedValueOnce({
        templates: [makeTemplate("template-2")],
        sends: [makeSend("send-2")],
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
    expect(mockLoadEmailStudioDataAction).toHaveBeenCalledTimes(2);
  });
});
