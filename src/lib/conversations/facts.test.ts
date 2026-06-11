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
});
