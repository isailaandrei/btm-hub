import { describe, expect, it } from "vitest";
import {
  BROADCAST_CONFIRMATION_MESSAGE,
  requiresBroadcastConfirmation,
} from "./broadcast-confirmation";

describe("broadcast confirmation", () => {
  it("requires confirmation for broadcasts only", () => {
    expect(requiresBroadcastConfirmation("broadcast")).toBe(true);
    expect(requiresBroadcastConfirmation("outreach")).toBe(false);
  });

  it("uses the approved confirmation copy", () => {
    expect(BROADCAST_CONFIRMATION_MESSAGE).toBe(
      "This newsletter will be sent to all eligible contacts. Do you want to proceed?",
    );
  });
});
