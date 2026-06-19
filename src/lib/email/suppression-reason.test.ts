import { describe, expect, it } from "vitest";
import {
  formatSuppressionReason,
  formatSuppressionSource,
} from "./suppression-reason";

describe("formatSuppressionReason", () => {
  it("maps each reason to a readable label", () => {
    expect(formatSuppressionReason("unsubscribe")).toBe("Unsubscribed");
    expect(formatSuppressionReason("hard_bounce")).toBe("Bounced");
    expect(formatSuppressionReason("spam_complaint")).toBe("Spam complaint");
    expect(formatSuppressionReason("invalid_address")).toBe("Invalid address");
    expect(formatSuppressionReason("manual")).toBe("Manually excluded");
    expect(formatSuppressionReason("do_not_contact")).toBe("Manually excluded");
  });
});

describe("formatSuppressionSource", () => {
  it("prefers the provider name", () => {
    expect(
      formatSuppressionSource({ reason: "hard_bounce", provider: "brevo" }),
    ).toBe("Brevo");
  });

  it("labels unsubscribes and admin actions without a provider", () => {
    expect(
      formatSuppressionSource({ reason: "unsubscribe", provider: null }),
    ).toBe("Unsubscribe link");
    expect(
      formatSuppressionSource({ reason: "do_not_contact", provider: null }),
    ).toBe("Admin");
  });
});
