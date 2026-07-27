/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

const mockLoadShared = vi.fn();
const mockInvalidateShared = vi.fn();
const mockSubscribe = vi.fn(() => () => {});
const mockCorrectLabel = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock the shared loader (not `loadContactAiMemory` in ../actions) so its
// module-level 30s TTL cache can't leak data between tests. `subscribe` returns
// a no-op unsubscribe.
vi.mock("./contact-ai-memory-loader", () => ({
  loadContactAiMemoryShared: mockLoadShared,
  invalidateContactAiMemoryShared: mockInvalidateShared,
  subscribeContactAiMemory: mockSubscribe,
}));

vi.mock("../actions", () => ({
  correctContactDigest: mockCorrectLabel,
}));

const { ContactAiMemorySection } = await import("./contact-ai-memory-section");

const CONTACT_ID = "550e8400-e29b-41d4-a716-446655440001";
const CONTENT_HASH = "a".repeat(64);

function makeDigest(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    contentHash: CONTENT_HASH,
    windowStart: "2026-06-11T10:00:00Z",
    windowEnd: "2026-06-11T10:30:00Z",
    isNoise: false,
    relevance: "profile",
    summary: "Runs a dive school in Bali.",
    eventDate: null,
    modelIsNoise: false,
    modelRelevance: "profile",
    modelSummary: "Runs a dive school in Bali.",
    modelEventDate: null,
    correctedAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

function makeMemory(digests: unknown[]) {
  return { digests, facts: [], freshnessDays: 45, eventGraceDays: 14 };
}

function labelButton(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label,
  );
}

function buttonContaining(container: HTMLElement, text: string) {
  return [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  );
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ContactAiMemorySection", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    // The fixtures below carry fixed window dates, but the grouping they
    // exercise is clock-relative (a status digest is visible until
    // windowEnd + freshnessDays), so a real clock silently reclassifies them
    // once that horizon passes. Pin the clock inside the window. Only `Date`
    // is faked — React's scheduler needs real timers to drive `act`.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-13T12:00:00Z"));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockLoadShared.mockReset();
    mockInvalidateShared.mockReset();
    mockCorrectLabel.mockReset().mockResolvedValue(undefined);
    vi.mocked(toast.error).mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("renders digests with their effective label and marks corrections", async () => {
    mockLoadShared.mockResolvedValue(
      makeMemory([
        // Corrected profile→status: effective label is status.
        makeDigest({
          relevance: "status",
          modelRelevance: "profile",
          correctedAt: "2026-07-09T09:00:00Z",
        }),
      ]),
    );

    await act(async () => {
      root.render(<ContactAiMemorySection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    expect(mockLoadShared).toHaveBeenCalledWith(CONTACT_ID);
    expect(container.textContent).toContain("Runs a dive school in Bali.");
    expect(container.textContent).toContain("(corrected)");
    // The effective label (status) is the active, disabled chip.
    expect(labelButton(container, "status")?.disabled).toBe(true);
    expect(labelButton(container, "profile")?.disabled).toBe(false);
    // Status digests show their freshness horizon.
    expect(container.textContent).toMatch(/visible to AI|no longer visible/);
  });

  it("optimistically applies a correction and invalidates the shared cache", async () => {
    mockLoadShared.mockResolvedValue(makeMemory([makeDigest()]));

    await act(async () => {
      root.render(<ContactAiMemorySection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    const statusChip = labelButton(container, "status");
    if (!statusChip) throw new Error("Missing status chip");
    await act(async () => {
      statusChip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(mockCorrectLabel).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      contentHash: CONTENT_HASH,
      label: "status",
      // A label-only flip preserves (unchanged) summary/date: they match the
      // model's originals, so both corrections are null.
      correctedSummary: null,
      correctedEventDate: null,
      // A label edit never toggles dismissal on its own.
      dismissed: false,
      // The label changed (profile → status), so the pair carries the model's
      // TRUE original — never a previous correction.
      originalRelevance: "profile",
      originalIsNoise: false,
    });
    // Local state flipped without a refetch; shared cache evicted so sibling
    // surfaces (WhatsApp badges) see the correction on their next load.
    expect(container.textContent).toContain("(corrected)");
    expect(labelButton(container, "status")?.disabled).toBe(true);
    expect(mockInvalidateShared).toHaveBeenCalledWith(CONTACT_ID);
    expect(mockLoadShared).toHaveBeenCalledTimes(1);
  });

  it("rolls back the optimistic label and toasts when the action fails", async () => {
    mockLoadShared.mockResolvedValue(makeMemory([makeDigest()]));
    mockCorrectLabel.mockRejectedValueOnce(new Error("nope"));

    await act(async () => {
      root.render(<ContactAiMemorySection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    const noiseChip = labelButton(container, "noise");
    if (!noiseChip) throw new Error("Missing noise chip");
    await act(async () => {
      noiseChip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    // Reverted: the original profile label is active again, no correction
    // marker, error surfaced, cache untouched.
    expect(labelButton(container, "profile")?.disabled).toBe(true);
    expect(container.textContent).not.toContain("(corrected)");
    expect(vi.mocked(toast.error)).toHaveBeenCalled();
    expect(mockInvalidateShared).not.toHaveBeenCalled();
  });

  it("folds corrected-to-noise into the collapsed zone and hides model-noise markers", async () => {
    mockLoadShared.mockResolvedValue(
      makeMemory([
        // Corrected to noise: must stay reviewable (auditable, revertible) — in
        // the collapsed "not visible to AI" zone.
        makeDigest({
          isNoise: true,
          relevance: null,
          correctedAt: "2026-07-09T09:00:00Z",
        }),
        // Model-labeled noise marker (empty summary): stays hidden entirely.
        makeDigest({
          id: "d2",
          contentHash: "b".repeat(64),
          isNoise: true,
          relevance: null,
          summary: "",
          modelIsNoise: true,
          modelRelevance: null,
        }),
      ]),
    );

    await act(async () => {
      root.render(<ContactAiMemorySection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    // Collapsed by default: only the corrected row is countable, and the zone
    // header reflects a single hidden digest (the model-noise marker is dropped).
    const disclosure = buttonContaining(container, "Not visible to AI");
    expect(disclosure?.textContent).toContain("Not visible to AI (1)");
    expect(container.textContent).not.toContain("Runs a dive school in Bali.");

    await act(async () => {
      disclosure?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(container.textContent).toContain("Runs a dive school in Bali.");
    expect(container.textContent).toContain("filtered — not visible to AI");
    expect(container.textContent).toContain("(corrected)");
    // Only the corrected row renders; the model-noise marker stays hidden.
    expect(container.querySelectorAll("ol > li")).toHaveLength(1);
  });

  it("groups digests into Profile, live Status, and a collapsed hidden zone", async () => {
    mockLoadShared.mockResolvedValue(
      makeMemory([
        makeDigest({ id: "p1", contentHash: "a".repeat(64) }), // profile
        makeDigest({
          id: "s1",
          contentHash: "b".repeat(64),
          relevance: "status",
          modelRelevance: "status",
          summary: "Arriving in August.",
          // Far-future event keeps it visible regardless of the test clock.
          eventDate: "2027-06-01",
          modelEventDate: "2027-06-01",
        }),
        makeDigest({
          id: "a1",
          contentHash: "c".repeat(64),
          relevance: "status",
          modelRelevance: "status",
          summary: "Old logistics that already passed.",
          // Ancient window, no event → aged out for any plausible run date.
          windowStart: "2020-01-01T10:00:00Z",
          windowEnd: "2020-01-01T10:30:00Z",
        }),
      ]),
    );

    await act(async () => {
      root.render(<ContactAiMemorySection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    expect(container.textContent).toContain("Profile");
    expect(container.textContent).toContain("Status");
    // Live groups render up top; the aged status digest is folded away.
    expect(container.textContent).toContain("Runs a dive school in Bali.");
    expect(container.textContent).toContain("Arriving in August.");
    expect(container.textContent).not.toContain("Old logistics that already passed.");
    expect(buttonContaining(container, "Not visible to AI")?.textContent).toContain(
      "Not visible to AI (1)",
    );
    // The live status row carries the quiet "Remove from AI memory" affordance.
    expect(buttonContaining(container, "Remove from AI memory")).toBeTruthy();
  });

  it("toggles the hidden-zone disclosure open and closed", async () => {
    mockLoadShared.mockResolvedValue(
      makeMemory([
        makeDigest({
          id: "a1",
          relevance: "status",
          modelRelevance: "status",
          summary: "Aged status detail.",
          windowStart: "2020-01-01T10:00:00Z",
          windowEnd: "2020-01-01T10:30:00Z",
        }),
      ]),
    );

    await act(async () => {
      root.render(<ContactAiMemorySection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    const disclosure = buttonContaining(container, "Not visible to AI");
    if (!disclosure) throw new Error("Missing disclosure");
    expect(container.textContent).not.toContain("Aged status detail.");

    await act(async () => {
      disclosure.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();
    expect(container.textContent).toContain("Aged status detail.");

    await act(async () => {
      disclosure.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();
    expect(container.textContent).not.toContain("Aged status detail.");
  });

  it("renders a Restore control on a dismissed digest and restores it label-lessly", async () => {
    mockLoadShared.mockResolvedValue(
      makeMemory([
        makeDigest({
          relevance: "status",
          modelRelevance: "status",
          // summary must match modelSummary so a label-less restore records no
          // summary correction either.
          summary: "Dismissed trip logistics.",
          modelSummary: "Dismissed trip logistics.",
          correctedAt: "2026-07-13T09:00:00Z",
          dismissedAt: "2026-07-13T09:00:00Z",
        }),
      ]),
    );

    await act(async () => {
      root.render(<ContactAiMemorySection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    // Dismissed digests live in the collapsed zone.
    const disclosure = buttonContaining(container, "Not visible to AI");
    await act(async () => {
      disclosure?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(container.textContent).toContain("Removed from AI memory");
    const restore = labelButton(container, "Restore");
    if (!restore) throw new Error("Missing Restore button");

    await act(async () => {
      restore.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    // Restore clears dismissal without touching the (model-matching) label, so no
    // label pair is recorded.
    expect(mockCorrectLabel).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      contentHash: CONTENT_HASH,
      label: null,
      correctedSummary: null,
      correctedEventDate: null,
      dismissed: false,
      originalRelevance: null,
      originalIsNoise: null,
    });
    expect(mockInvalidateShared).toHaveBeenCalledWith(CONTACT_ID);
  });
});
