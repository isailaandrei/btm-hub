/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLoad = vi.fn();
const mockRemoveChannel = vi.fn();
const channelStub = {
  on: vi.fn(() => channelStub),
  subscribe: vi.fn(() => channelStub),
};

vi.mock("../actions", () => ({
  loadContactWhatsAppMessages: mockLoad,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: vi.fn(() => channelStub),
    removeChannel: mockRemoveChannel,
  }),
}));

const { ContactWhatsAppSection } = await import("./contact-whatsapp-section");

const CONTACT_ID = "550e8400-e29b-41d4-a716-446655440001";

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    direction: "inbound",
    body: "Hey there",
    media: [],
    fromIdentifier: "+40787604139",
    toIdentifier: "+351939054063",
    happenedAt: new Date().toISOString(),
    matchStatus: "matched",
    ...overrides,
  };
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ContactWhatsAppSection", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockLoad.mockReset();
    channelStub.on.mockClear();
    channelStub.subscribe.mockClear();
    mockRemoveChannel.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the thread it loads on mount", async () => {
    mockLoad.mockResolvedValue([makeMessage()]);

    await act(async () => {
      root.render(<ContactWhatsAppSection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    expect(mockLoad).toHaveBeenCalledWith(CONTACT_ID);
    expect(container.textContent).toContain("Hey there");
  });

  it("subscribes to realtime changes filtered on the contact", async () => {
    mockLoad.mockResolvedValue([]);

    await act(async () => {
      root.render(<ContactWhatsAppSection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    expect(channelStub.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        table: "conversation_messages",
        filter: `contact_id=eq.${CONTACT_ID}`,
      }),
      expect.any(Function),
    );
    expect(container.textContent).toContain("No WhatsApp messages");
  });

  it("surfaces a load error with a retry instead of an empty thread", async () => {
    mockLoad.mockRejectedValueOnce(new Error("boom"));

    await act(async () => {
      root.render(<ContactWhatsAppSection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    expect(container.textContent).toContain("boom");
    expect(
      [...container.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "Retry",
      ),
    ).toBe(true);
  });
});
