import { describe, expect, it } from "vitest";
import { buildConversationFactInputs } from "./facts";

describe("conversation facts", () => {
  it("creates append-only conflict-aware fact rows from extractor output", () => {
    const rows = buildConversationFactInputs({
      contactId: "contact-1",
      sourceMessageIds: ["message-1"],
      observedAt: "2026-06-11T10:00:00Z",
      extractorModel: "fixture",
      extractorVersion: "v1",
      facts: [
        {
          fieldKey: "budget",
          valueText: "$3-5k",
          confidence: "medium",
        },
        {
          fieldKey: "budget",
          valueText: "~$8k",
          confidence: "medium",
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        fieldKey: "budget",
        valueText: "$3-5k",
        conflictGroup: "budget",
      }),
      expect.objectContaining({
        fieldKey: "budget",
        valueText: "~$8k",
        conflictGroup: "budget",
      }),
    ]);
  });

  it("normalizes an invented non-registry fieldKey to null, preserving known keys", () => {
    const rows = buildConversationFactInputs({
      contactId: "contact-1",
      sourceMessageIds: ["message-1"],
      observedAt: "2026-06-11T10:00:00Z",
      extractorModel: "fixture",
      facts: [
        // Not a FIELD_REGISTRY key — a genuinely invented one.
        { fieldKey: "made_up_topic_xyz", valueText: "Lives near the marina", confidence: "low" },
        { fieldKey: "budget", valueText: "$5k", confidence: "high" },
      ],
    });

    // Unknown key → null (and its conflictGroup falls back to the contact scope);
    // valueText/confidence are preserved.
    expect(rows[0]).toMatchObject({
      fieldKey: null,
      valueText: "Lives near the marina",
      confidence: "low",
      conflictGroup: "conversation:contact-1",
    });
    // Known registry key → preserved.
    expect(rows[1]).toMatchObject({ fieldKey: "budget", conflictGroup: "budget" });
  });
});
