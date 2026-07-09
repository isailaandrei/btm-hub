/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

const mockLoad = vi.fn();
const mockDeactivate = vi.fn();
const mockRestore = vi.fn();
// AI-visibility data load (badges). Defaults to an empty memory so existing
// thread behaviors render badge-less, exactly like a contact with no digests.
const mockLoadAiMemory = vi.fn();
const mockRemoveChannel = vi.fn();
const channelStub = {
  on: vi.fn(() => channelStub),
  subscribe: vi.fn(() => channelStub),
};

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../actions", () => ({
  loadContactWhatsAppMessages: mockLoad,
  deactivateContactWhatsAppMessage: mockDeactivate,
  restoreContactWhatsAppMessage: mockRestore,
  loadContactAiMemory: mockLoadAiMemory,
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
    deactivatedAt: null,
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
    mockDeactivate.mockReset().mockResolvedValue(undefined);
    mockRestore.mockReset().mockResolvedValue(undefined);
    mockLoadAiMemory.mockReset().mockResolvedValue({
      digests: [],
      facts: [],
      freshnessDays: 45,
    });
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

  it("renders server-seeded initialMessages without firing its load action (realtime still subscribes)", async () => {
    const seeded = [makeMessage({ body: "Seeded hello" })] as Parameters<
      typeof ContactWhatsAppSection
    >[0]["initialMessages"];

    await act(async () => {
      root.render(
        <ContactWhatsAppSection
          contactId={CONTACT_ID}
          initialMessages={seeded}
        />,
      );
    });
    await flushAsyncWork();

    expect(mockLoad).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Seeded hello");
    // The realtime channel is the refresh path and must stay active.
    expect(channelStub.subscribe).toHaveBeenCalled();
  });

  it("revalidates cached initialMessages once in the background and writes back", async () => {
    const seeded = [makeMessage({ body: "Cached hello" })] as Parameters<
      typeof ContactWhatsAppSection
    >[0]["initialMessages"];
    const fresh = [makeMessage({ id: "m2", body: "Fresh hello" })];
    let resolveLoad!: (value: unknown) => void;
    mockLoad.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const onMessagesLoaded = vi.fn();

    await act(async () => {
      root.render(
        <ContactWhatsAppSection
          contactId={CONTACT_ID}
          initialMessages={seeded}
          revalidateInitialData
          onMessagesLoaded={onMessagesLoaded}
        />,
      );
    });
    // Revalidation is in flight — the cached thread stays painted (no skeleton).
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Cached hello");

    await act(async () => {
      resolveLoad(fresh);
    });
    await flushAsyncWork();

    expect(onMessagesLoaded).toHaveBeenCalledWith(fresh);
    expect(container.textContent).toContain("Fresh hello");
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

  it("renders image attachments as <img> through the media proxy", async () => {
    mockLoad.mockResolvedValue([
      makeMessage({
        media: [
          {
            url: "https://api.ycloud.com/v2/whatsapp/media/download/x",
            contentType: "image/jpeg",
          },
        ],
      }),
    ]);

    await act(async () => {
      root.render(<ContactWhatsAppSection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain(
      "/api/whatsapp/ycloud/media?messageId=m1",
    );
  });

  it("removes a message via the deactivate action and re-reads", async () => {
    mockLoad
      .mockResolvedValueOnce([makeMessage()])
      .mockResolvedValueOnce([makeMessage({ deactivatedAt: "2026-06-26T00:00:00Z" })]);

    await act(async () => {
      root.render(<ContactWhatsAppSection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    const removeButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Remove",
    );
    if (!removeButton) throw new Error("Missing Remove button");

    await act(async () => {
      removeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(mockDeactivate).toHaveBeenCalledWith("m1");
    // Re-read after the mutation moved it out of the active thread.
    expect(mockLoad).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("All messages removed");
    expect(container.textContent).toContain("Show removed (1)");
  });

  it("optimistically moves a message and rolls back if the mutation fails", async () => {
    mockLoad.mockResolvedValue([makeMessage()]);
    mockDeactivate.mockRejectedValueOnce(new Error("nope"));

    await act(async () => {
      root.render(<ContactWhatsAppSection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    const removeButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Remove",
    );
    if (!removeButton) throw new Error("Missing Remove button");

    await act(async () => {
      removeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    // The failed mutation reverts the optimistic move: the message is back in
    // the active thread, the error is surfaced, and no re-read was issued.
    expect(mockDeactivate).toHaveBeenCalledWith("m1");
    expect(container.textContent).toContain("Hey there");
    expect(container.textContent).not.toContain("All messages removed");
    expect(vi.mocked(toast.error)).toHaveBeenCalled();
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it("restores a removed message from the collapsible area", async () => {
    mockLoad.mockResolvedValue([
      makeMessage({ id: "m1", deactivatedAt: "2026-06-26T00:00:00Z" }),
    ]);

    await act(async () => {
      root.render(<ContactWhatsAppSection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    const showRemoved = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Show removed"),
    );
    if (!showRemoved) throw new Error("Missing 'Show removed' toggle");
    await act(async () => {
      showRemoved.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const restoreButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Restore",
    );
    if (!restoreButton) throw new Error("Missing Restore button");
    await act(async () => {
      restoreButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(mockRestore).toHaveBeenCalledWith("m1");
  });
});
