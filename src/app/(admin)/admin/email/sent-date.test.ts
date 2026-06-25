import { describe, expect, it } from "vitest";
import { formatEmailSendTiming, formatSentOnDate } from "./sent-date";

describe("formatSentOnDate", () => {
  it("formats the sent date with a digestible time", () => {
    expect(
      formatSentOnDate("2026-05-01T11:35:00.000Z", {
        locale: "en-US",
        timeZone: "UTC",
      }),
    ).toBe("Sent on May 1, 2026 at 11:35 am");
  });

  it("returns null for missing or invalid dates", () => {
    expect(formatSentOnDate(null)).toBeNull();
    expect(formatSentOnDate("not-a-date")).toBeNull();
  });

  it("uses state-aware labels when an email is not fully sent", () => {
    const options = {
      locale: "en-US",
      timeZone: "UTC",
    };

    expect(
      formatEmailSendTiming(
        {
          status: "queued",
          confirmed_at: "2026-05-01T11:35:00.000Z",
          created_at: "2026-05-01T11:30:00.000Z",
        },
        options,
      ),
    ).toBe("Queued on May 1, 2026 at 11:35 am");
    expect(
      formatEmailSendTiming(
        {
          status: "failed",
          confirmed_at: "2026-05-01T11:35:00.000Z",
          created_at: "2026-05-01T11:30:00.000Z",
        },
        options,
      ),
    ).toBe("Failed on May 1, 2026 at 11:35 am");
  });

  it("still reads as sent when only some recipients failed", () => {
    // A few bounced/failed recipients shouldn't relabel the whole campaign as a
    // failure — partially_failed mostly delivered.
    expect(
      formatEmailSendTiming(
        {
          status: "partially_failed",
          confirmed_at: "2026-05-01T11:35:00.000Z",
          created_at: "2026-05-01T11:30:00.000Z",
        },
        { locale: "en-US", timeZone: "UTC" },
      ),
    ).toBe("Sent on May 1, 2026 at 11:35 am");
  });
});
