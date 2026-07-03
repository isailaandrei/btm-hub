/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLoad = vi.fn();
const mockExclude = vi.fn();
const mockAllow = vi.fn();
const mockRemoveChannel = vi.fn();
const channelStub = {
  on: vi.fn(() => channelStub),
  subscribe: vi.fn(() => channelStub),
};

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../actions", () => ({
  loadContactEmailSection: mockLoad,
  excludeContactFromEmail: mockExclude,
  allowContactEmail: mockAllow,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: vi.fn(() => channelStub),
    removeChannel: mockRemoveChannel,
  }),
}));

const { ContactEmailSection } = await import("./contact-email-section");

const CONTACT_ID = "550e8400-e29b-41d4-a716-446655440001";

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ContactEmailSection", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockLoad.mockReset();
    mockExclude.mockReset().mockResolvedValue(undefined);
    mockAllow.mockReset().mockResolvedValue(undefined);
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

  it("renders server-seeded initialData without firing its load action", async () => {
    await act(async () => {
      root.render(
        <ContactEmailSection
          contactId={CONTACT_ID}
          initialData={{ excluded: true, reason: "manual" }}
        />,
      );
    });
    await flushAsyncWork();

    expect(mockLoad).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Excluded from all email");
  });

  it("renders cached initialData instantly but revalidates once in the background (and writes back)", async () => {
    let resolveLoad!: (value: { excluded: boolean; reason: null }) => void;
    mockLoad.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const onDataLoaded = vi.fn();

    await act(async () => {
      root.render(
        <ContactEmailSection
          contactId={CONTACT_ID}
          initialData={{ excluded: true, reason: "manual" }}
          revalidateInitialData
          onDataLoaded={onDataLoaded}
        />,
      );
    });
    // Revalidation is in flight — the cached value stays painted (no skeleton).
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Excluded from all email");

    await act(async () => {
      resolveLoad({ excluded: false, reason: null });
    });
    await flushAsyncWork();

    expect(onDataLoaded).toHaveBeenCalledWith({ excluded: false, reason: null });
    expect(container.textContent).toContain("This contact can receive email");
  });

  it("subscribes to suppression changes by contact_id and email, and reloads on an event", async () => {
    vi.useFakeTimers();
    try {
      mockLoad.mockResolvedValue({ excluded: false, reason: null });

      await act(async () => {
        root.render(
          <ContactEmailSection
            contactId={CONTACT_ID}
            contactEmail=" Jane@Example.com "
            initialData={{ excluded: false, reason: null }}
          />,
        );
      });

      const onCalls = channelStub.on.mock.calls as unknown as [
        string,
        { filter?: string },
        () => void,
      ][];
      const bindings = onCalls.map(([, config]) => config.filter);
      expect(bindings).toContain(`contact_id=eq.${CONTACT_ID}`);
      // Matches the server-side normalizeEmail (trim + lowercase).
      expect(bindings).toContain("email=eq.jane@example.com");
      expect(channelStub.subscribe).toHaveBeenCalled();
      expect(mockLoad).not.toHaveBeenCalled();

      // Fire a realtime event → debounced re-read replaces the status.
      mockLoad.mockResolvedValue({ excluded: true, reason: "unsubscribed" });
      const trigger = onCalls[0][2];
      await act(async () => {
        trigger();
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(mockLoad).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain("Excluded from all email");
    } finally {
      vi.useRealTimers();
    }
  });

  it("loads its own status on mount", async () => {
    mockLoad.mockResolvedValue({ excluded: false, reason: null });

    await act(async () => {
      root.render(<ContactEmailSection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    expect(mockLoad).toHaveBeenCalledWith(CONTACT_ID);
    expect(container.textContent).toContain("This contact can receive email");
  });

  it("re-reads after a successful exclude — the session cache can't refresh on its own", async () => {
    mockLoad
      .mockResolvedValueOnce({ excluded: false, reason: null })
      .mockResolvedValueOnce({ excluded: true, reason: "manual" });

    await act(async () => {
      root.render(<ContactEmailSection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    const excludeButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Exclude from all email"),
    );
    if (!excludeButton) throw new Error("Missing exclude button");

    await act(async () => {
      excludeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(mockExclude).toHaveBeenCalledWith(CONTACT_ID);
    // onChanged → loadData fired a second read, flipping the card to excluded.
    expect(mockLoad).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Excluded from all email");
  });

  it("surfaces a load error with a retry instead of faking a status", async () => {
    mockLoad.mockRejectedValueOnce(new Error("boom"));

    await act(async () => {
      root.render(<ContactEmailSection contactId={CONTACT_ID} />);
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
