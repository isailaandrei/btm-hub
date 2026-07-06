import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildContactDigitIndex,
  buildContactPhoneIndex,
  matchContactByDigits,
  matchContactByPhone,
  normalizePhoneDigits,
  normalizePhoneNumber,
} from "./phone";
import type { ContactCardRecord } from "@/lib/data/contact-cards";

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CONTACT_ID = "22222222-2222-4222-8222-222222222222";
const ORIGINAL_DEFAULT_PHONE_REGION = process.env.DEFAULT_PHONE_REGION;

function makeRecord(overrides: {
  contactId: string;
  contactPhone?: string | null;
  applicationPhone?: string | null;
}): ContactCardRecord {
  return {
    contact: {
      id: overrides.contactId,
      name: overrides.contactId,
      email: `${overrides.contactId}@example.com`,
      phone: overrides.contactPhone ?? null,
      profile_id: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    },
    applications: overrides.applicationPhone
      ? [
          {
            id: `${overrides.contactId.slice(0, 8)}-3333-4333-8333-333333333333`,
            user_id: null,
            contact_id: overrides.contactId,
            program: "filmmaking",
            status: "reviewing",
            answers: { phone: overrides.applicationPhone },
            tags: [],
            admin_notes: [],
            submitted_at: "2026-03-02T00:00:00Z",
            updated_at: "2026-03-02T00:00:00Z",
          },
        ]
      : [],
    contactNotes: [],
    contactTags: [],
  };
}

describe("normalizePhoneNumber", () => {
  afterEach(() => {
    if (ORIGINAL_DEFAULT_PHONE_REGION === undefined) {
      delete process.env.DEFAULT_PHONE_REGION;
    } else {
      process.env.DEFAULT_PHONE_REGION = ORIGINAL_DEFAULT_PHONE_REGION;
    }
  });

  it("normalizes stored free-text numbers using libphonenumber metadata", () => {
    expect(normalizePhoneNumber("(213) 373-4253", "US")?.e164).toBe("+12133734253");
    expect(normalizePhoneNumber("whatsapp:+12133734253", "US")?.e164).toBe(
      "+12133734253",
    );
  });

  it("normalizes E.164 international numbers without relying on the default region", () => {
    process.env.DEFAULT_PHONE_REGION = "US";

    expect(normalizePhoneNumber("+351912345678")?.e164).toBe("+351912345678");
  });

  it("uses DEFAULT_PHONE_REGION for national-format numbers", () => {
    process.env.DEFAULT_PHONE_REGION = "PT";

    expect(normalizePhoneNumber("912345678")?.e164).toBe("+351912345678");
  });

  it("returns null for numbers libphonenumber cannot parse or validate", () => {
    expect(normalizePhoneNumber("not a phone", "US")).toBeNull();
  });
});

describe("contact phone matching", () => {
  it("matches against the union of contacts.phone and application.answers.phone", () => {
    const index = buildContactPhoneIndex([
      makeRecord({
        contactId: CONTACT_ID,
        contactPhone: null,
        applicationPhone: "(213) 373-4253",
      }),
    ]);

    expect(matchContactByPhone(index, "+12133734253")).toEqual({
      status: "matched",
      contactId: CONTACT_ID,
      e164: "+12133734253",
      matchedVia: expect.stringMatching(/^application:/),
    });
  });

  it("returns unmatched instead of dropping messages with unknown phones", () => {
    const index = buildContactPhoneIndex([
      makeRecord({ contactId: CONTACT_ID, contactPhone: "+12133734253" }),
    ]);

    expect(matchContactByPhone(index, "+15551234567")).toEqual({
      status: "unmatched",
      e164: "+15551234567",
    });
  });

  it("flags ambiguous matches and does not guess a contact", () => {
    const index = buildContactPhoneIndex([
      makeRecord({ contactId: CONTACT_ID, contactPhone: "+12133734253" }),
      makeRecord({
        contactId: OTHER_CONTACT_ID,
        applicationPhone: "(213) 373-4253",
      }),
    ]);

    expect(matchContactByPhone(index, "+12133734253")).toEqual({
      status: "ambiguous",
      e164: "+12133734253",
      contactIds: [CONTACT_ID, OTHER_CONTACT_ID],
      matchedVia: [
        { contactId: CONTACT_ID, via: "contact.phone" },
        {
          contactId: OTHER_CONTACT_ID,
          via: expect.stringMatching(/^application:/),
        },
      ],
    });
  });
});

describe("normalizePhoneDigits", () => {
  it("strips formatting to a bare digit string", () => {
    expect(normalizePhoneDigits("+351 939 054 063")).toBe("351939054063");
    expect(normalizePhoneDigits("939-054-063")).toBe("939054063");
    expect(normalizePhoneDigits("  939 054 063 ")).toBe("939054063");
  });

  it("drops a leading 00 international prefix", () => {
    expect(normalizePhoneDigits("00351939054063")).toBe("351939054063");
  });

  it("keeps a single national leading zero (only 00 is a prefix)", () => {
    expect(normalizePhoneDigits("0939054063")).toBe("0939054063");
  });

  it("returns null when there are no digits", () => {
    expect(normalizePhoneDigits("no digits")).toBeNull();
    expect(normalizePhoneDigits(null)).toBeNull();
    expect(normalizePhoneDigits("")).toBeNull();
  });
});

describe("digit-suffix phone matching", () => {
  it("matches on exact normalized digits across formatting and 00-prefix variance", () => {
    const index = buildContactDigitIndex([
      makeRecord({ contactId: CONTACT_ID, contactPhone: "+351939054063" }),
    ]);

    expect(matchContactByDigits(index, "00351 939 054 063")).toEqual({
      status: "matched",
      e164: "351939054063",
      contactId: CONTACT_ID,
      matchedVia: "contact.phone",
    });
  });

  it("matches a national number by unique 9-digit suffix", () => {
    const index = buildContactDigitIndex([
      makeRecord({ contactId: CONTACT_ID, contactPhone: "+351939054063" }),
    ]);

    // National form (leading 0, no country code) never equals the stored E.164
    // digits but shares the last 9 — a unique suffix, so it matches.
    expect(matchContactByDigits(index, "0939054063")).toEqual({
      status: "matched",
      e164: "0939054063",
      contactId: CONTACT_ID,
      matchedVia: "suffix9:contact.phone",
    });
  });

  it("refuses a suffix match when two contacts share the tail, warning instead", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const index = buildContactDigitIndex([
      makeRecord({ contactId: CONTACT_ID, contactPhone: "+351939054063" }),
      makeRecord({ contactId: OTHER_CONTACT_ID, contactPhone: "+1939054063" }),
    ]);

    expect(matchContactByDigits(index, "0939054063")).toEqual({
      status: "unmatched",
      e164: "0939054063",
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  it("still resolves an exact match even when the suffix is shared", () => {
    const index = buildContactDigitIndex([
      makeRecord({ contactId: CONTACT_ID, contactPhone: "+351939054063" }),
      makeRecord({ contactId: OTHER_CONTACT_ID, contactPhone: "+1939054063" }),
    ]);

    expect(matchContactByDigits(index, "351939054063")).toMatchObject({
      status: "matched",
      contactId: CONTACT_ID,
    });
  });

  it("never matches numbers shorter than 9 digits", () => {
    const index = buildContactDigitIndex([
      makeRecord({ contactId: CONTACT_ID, contactPhone: "+351939054063" }),
    ]);

    expect(matchContactByDigits(index, "12345678")).toEqual({
      status: "unmatched",
      e164: "12345678",
    });
  });

  it("returns unmatched for an unknown number", () => {
    const index = buildContactDigitIndex([
      makeRecord({ contactId: CONTACT_ID, contactPhone: "+351939054063" }),
    ]);

    expect(matchContactByDigits(index, "+15551234567")).toEqual({
      status: "unmatched",
      e164: "15551234567",
    });
  });
});
