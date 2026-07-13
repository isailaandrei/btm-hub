import { describe, expect, it } from "vitest";
import type { ContactConversationDigest } from "@/lib/data/conversations";
import {
  applyPayloadToDigest,
  buildDigestCorrectionPayload,
} from "./digest-label-control";

function digest(
  overrides: Partial<ContactConversationDigest> = {},
): ContactConversationDigest {
  return {
    id: "d1",
    contentHash: "a".repeat(64),
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

describe("buildDigestCorrectionPayload", () => {
  it("records NO label pair when the label matches the model", () => {
    const payload = buildDigestCorrectionPayload({
      label: "profile",
      modelLabel: "profile",
      summaryText: "Runs a dive school in Bali.",
      eventDateText: "",
      modelSummary: "Runs a dive school in Bali.",
      modelEventDate: null,
      dismissed: false,
    });
    expect(payload.label).toBeNull();
    expect(payload.correctedSummary).toBeNull();
    expect(payload.correctedEventDate).toBeNull();
    expect(payload.dismissed).toBe(false);
  });

  it("records the label when it differs from the model", () => {
    const payload = buildDigestCorrectionPayload({
      label: "status",
      modelLabel: "profile",
      summaryText: "Runs a dive school in Bali.",
      eventDateText: "",
      modelSummary: "Runs a dive school in Bali.",
      modelEventDate: null,
      dismissed: false,
    });
    expect(payload.label).toBe("status");
  });

  it("diffs the summary and event date against the model", () => {
    const changed = buildDigestCorrectionPayload({
      label: "status",
      modelLabel: "status",
      summaryText: "Arriving August 17th.",
      eventDateText: "2026-08-17",
      modelSummary: "Runs a dive school in Bali.",
      modelEventDate: null,
      dismissed: false,
    });
    expect(changed.label).toBeNull(); // label unchanged
    expect(changed.correctedSummary).toBe("Arriving August 17th.");
    expect(changed.correctedEventDate).toBe("2026-08-17");

    const unchanged = buildDigestCorrectionPayload({
      label: "status",
      modelLabel: "status",
      summaryText: "Runs a dive school in Bali.",
      eventDateText: "2026-08-17",
      modelSummary: "Runs a dive school in Bali.",
      modelEventDate: "2026-08-17",
      dismissed: false,
    });
    expect(unchanged.correctedSummary).toBeNull();
    expect(unchanged.correctedEventDate).toBeNull();
  });

  it("carries the dismissal through unchanged, and toggles when overridden", () => {
    const preserved = buildDigestCorrectionPayload({
      label: "status",
      modelLabel: "status",
      summaryText: "Runs a dive school in Bali.",
      eventDateText: "",
      modelSummary: "Runs a dive school in Bali.",
      modelEventDate: null,
      dismissed: true,
    });
    expect(preserved.dismissed).toBe(true);

    const toggledOff = buildDigestCorrectionPayload({
      label: "status",
      modelLabel: "status",
      summaryText: "Runs a dive school in Bali.",
      eventDateText: "",
      modelSummary: "Runs a dive school in Bali.",
      modelEventDate: null,
      dismissed: false,
    });
    expect(toggledOff.dismissed).toBe(false);
  });
});

describe("applyPayloadToDigest", () => {
  const NOW = "2026-07-13T12:00:00.000Z";

  it("leaves the effective label untouched for a label-less payload", () => {
    const result = applyPayloadToDigest(
      digest({ relevance: "status", modelRelevance: "status" }),
      { label: null, correctedSummary: null, correctedEventDate: null, dismissed: false },
      NOW,
    );
    expect(result.isNoise).toBe(false);
    expect(result.relevance).toBe("status");
    expect(result.correctedAt).toBe(NOW);
  });

  it("applies a label change to isNoise/relevance", () => {
    const toNoise = applyPayloadToDigest(
      digest(),
      { label: "noise", correctedSummary: null, correctedEventDate: null, dismissed: false },
      NOW,
    );
    expect(toNoise.isNoise).toBe(true);
    expect(toNoise.relevance).toBeNull();

    const toStatus = applyPayloadToDigest(
      digest(),
      { label: "status", correctedSummary: null, correctedEventDate: null, dismissed: false },
      NOW,
    );
    expect(toStatus.isNoise).toBe(false);
    expect(toStatus.relevance).toBe("status");
  });

  it("stamps a fresh dismissal but preserves an existing one", () => {
    const fresh = applyPayloadToDigest(
      digest({ relevance: "status", modelRelevance: "status" }),
      { label: null, correctedSummary: null, correctedEventDate: null, dismissed: true },
      NOW,
    );
    expect(fresh.dismissedAt).toBe(NOW);

    const already = applyPayloadToDigest(
      digest({
        relevance: "status",
        modelRelevance: "status",
        dismissedAt: "2026-07-01T00:00:00.000Z",
      }),
      { label: null, correctedSummary: null, correctedEventDate: null, dismissed: true },
      NOW,
    );
    expect(already.dismissedAt).toBe("2026-07-01T00:00:00.000Z");

    const restored = applyPayloadToDigest(
      digest({
        relevance: "status",
        modelRelevance: "status",
        dismissedAt: "2026-07-01T00:00:00.000Z",
      }),
      { label: null, correctedSummary: null, correctedEventDate: null, dismissed: false },
      NOW,
    );
    expect(restored.dismissedAt).toBeNull();
  });
});
