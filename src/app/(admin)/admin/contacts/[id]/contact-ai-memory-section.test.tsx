/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

const mockLoadShared = vi.fn();
const mockInvalidateShared = vi.fn();
const mockCorrectLabel = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock the shared loader (not `loadContactAiMemory` in ../actions) so its
// module-level 30s TTL cache can't leak data between tests.
vi.mock("./contact-ai-memory-loader", () => ({
  loadContactAiMemoryShared: mockLoadShared,
  invalidateContactAiMemoryShared: mockInvalidateShared,
}));

vi.mock("../actions", () => ({
  correctContactDigestLabel: mockCorrectLabel,
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
    modelIsNoise: false,
    modelRelevance: "profile",
    correctedAt: null,
    ...overrides,
  };
}

function makeMemory(digests: unknown[]) {
  return { digests, facts: [], freshnessDays: 45 };
}

function labelButton(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label,
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
      // Always the model's TRUE original, never a previous correction.
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

  it("keeps corrected-to-noise digests visible and hides model-noise markers", async () => {
    mockLoadShared.mockResolvedValue(
      makeMemory([
        // Corrected to noise: must stay visible (auditable, revertible).
        makeDigest({
          isNoise: true,
          relevance: null,
          correctedAt: "2026-07-09T09:00:00Z",
        }),
        // Model-labeled noise marker (empty summary): stays hidden.
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

    expect(container.textContent).toContain("Runs a dive school in Bali.");
    expect(container.textContent).toContain("filtered — not visible to AI");
    expect(container.textContent).toContain("(corrected)");
    // Only the corrected row renders; the model-noise marker stays hidden.
    expect(container.querySelectorAll("ol > li")).toHaveLength(1);
  });
});
