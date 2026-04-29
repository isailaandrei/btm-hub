import { describe, expect, it } from "vitest";
import { extractRecipientIdFromReplyAddress } from "./reply-matching";

describe("reply matching", () => {
  it("extracts recipient id from reply tracking address", () => {
    expect(
      extractRecipientIdFromReplyAddress(
        "r-11111111-1111-1111-1111-111111111111@replies.behind-the-mask.com",
      ),
    ).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("returns null for non-tracking addresses", () => {
    expect(extractRecipientIdFromReplyAddress("hello@example.com")).toBeNull();
  });
});
