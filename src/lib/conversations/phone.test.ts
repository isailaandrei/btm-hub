import { afterEach, describe, expect, it } from "vitest";
import {
  buildContactPhoneIndex,
  matchContactByPhone,
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
