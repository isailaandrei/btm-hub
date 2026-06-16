/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailManualRecipient, EmailTemplate } from "@/types/database";

const mockSendEmailNowAction = vi.fn();
const mockSaveEmailManualRecipientAction = vi.fn();
const mockGetComposeRecipientsAction = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

vi.mock("../actions", () => ({
  sendEmailNowAction: mockSendEmailNowAction,
  saveEmailManualRecipientAction: mockSaveEmailManualRecipientAction,
  getComposeRecipientsAction: mockGetComposeRecipientsAction,
}));

vi.mock("../templates/email-designer", async () => {
  const React = await import("react");
  return {
    EmailDesigner: React.forwardRef(function MockEmailDesigner(_props, ref) {
      React.useImperativeHandle(ref, () => ({
        getSnapshot: () => ({
          builderJson: { type: "doc", content: [] },
        }),
        loadDocument: vi.fn(),
      }));
      return <div data-testid="email-designer" />;
    }),
  };
});

const { EmailComposer } = await import("./email-composer");

const TEMPLATE_VERSION_ID = "550e8400-e29b-41d4-a716-446655440010";
const MANUAL_RECIPIENT: EmailManualRecipient = {
  id: "550e8400-e29b-41d4-a716-446655440030",
  email: "friend@example.com",
  name: "Future Applicant",
  notes: "",
  created_by: "admin-1",
  updated_by: "admin-1",
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
};

function template(): EmailTemplate {
  return {
    id: "template-1",
    name: "Template 1",
    description: "",
    category: "general",
    status: "published",
    builder_type: "maily",
    current_version_id: TEMPLATE_VERSION_ID,
    created_by: "admin-1",
    updated_by: "admin-1",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  };
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("EmailComposer manual recipients", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockSendEmailNowAction.mockReset().mockResolvedValue({ sendId: "send-1" });
    mockSaveEmailManualRecipientAction
      .mockReset()
      .mockResolvedValue({ manualRecipient: MANUAL_RECIPIENT });
    mockGetComposeRecipientsAction.mockReset().mockResolvedValue({
      eligible: [
        {
          name: MANUAL_RECIPIENT.name,
          email: MANUAL_RECIPIENT.email,
          source: "manual",
        },
      ],
      skipped: [],
    });
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("sends outreach to selected saved manual recipients", async () => {
    await act(async () => {
      root.render(
        <EmailComposer
          templates={[template()]}
          templateVersionsById={{
            [TEMPLATE_VERSION_ID]: {
              builderJson: { type: "doc", content: [] },
            },
          }}
          ensureTemplateVersion={vi.fn()}
          selectedContactIds={[]}
          manualRecipients={[MANUAL_RECIPIENT]}
          setManualRecipients={vi.fn()}
        />,
      );
    });

    const checkbox = container.querySelector<HTMLInputElement>(
      `input[type="checkbox"][value="${MANUAL_RECIPIENT.id}"]`,
    );
    if (!checkbox) throw new Error("Missing manual recipient checkbox");
    await act(async () => {
      checkbox.click();
    });

    const sendButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Send now",
    );
    if (!sendButton) throw new Error("Missing send button");
    await act(async () => {
      sendButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(mockSendEmailNowAction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "outreach",
        contactIds: [],
        manualRecipientIds: [MANUAL_RECIPIENT.id],
      }),
    );
  });

  it("lists the resolved recipients by name once they are selected", async () => {
    await act(async () => {
      root.render(
        <EmailComposer
          templates={[template()]}
          templateVersionsById={{
            [TEMPLATE_VERSION_ID]: {
              builderJson: { type: "doc", content: [] },
            },
          }}
          ensureTemplateVersion={vi.fn()}
          selectedContactIds={[]}
          manualRecipients={[MANUAL_RECIPIENT]}
          setManualRecipients={vi.fn()}
        />,
      );
    });

    const checkbox = container.querySelector<HTMLInputElement>(
      `input[type="checkbox"][value="${MANUAL_RECIPIENT.id}"]`,
    );
    if (!checkbox) throw new Error("Missing manual recipient checkbox");
    await act(async () => {
      checkbox.click();
    });
    await flushAsyncWork();

    expect(mockGetComposeRecipientsAction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "outreach",
        manualRecipientIds: [MANUAL_RECIPIENT.id],
      }),
    );
    expect(container.textContent).toContain("1 recipient will receive this email");
    expect(container.textContent).toContain(MANUAL_RECIPIENT.email);
  });
});
