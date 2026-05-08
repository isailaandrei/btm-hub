import { describe, expect, it } from "vitest";
import { SHOP_RESERVATION_TTL_MS, getReservationExpiry } from "./reservations";

describe("shop reservation helpers", () => {
  it("uses a 30 minute checkout reservation window to match Stripe Checkout minimum expiry", () => {
    expect(SHOP_RESERVATION_TTL_MS).toBe(30 * 60 * 1000);
  });

  it("calculates expiry from the supplied start date", () => {
    expect(getReservationExpiry(new Date("2026-05-08T10:00:00.000Z")).toISOString())
      .toBe("2026-05-08T10:30:00.000Z");
  });
});
