import parsePhoneNumber, { type CountryCode } from "libphonenumber-js";
import type { ContactCardRecord } from "@/lib/data/contact-cards";

export type NormalizedPhone = {
  raw: string;
  e164: string;
};

export type PhoneMatchSource = {
  contactId: string;
  via: string;
};

export type ContactPhoneIndex = Map<string, PhoneMatchSource[]>;

export type ContactPhoneMatch =
  | {
      status: "matched";
      e164: string;
      contactId: string;
      matchedVia: string;
    }
  | {
      status: "unmatched";
      e164: string;
    }
  | {
      status: "ambiguous";
      e164: string;
      contactIds: string[];
      matchedVia: PhoneMatchSource[];
    };

function stripKnownProviderPrefix(raw: string): string {
  return raw.replace(/^whatsapp:/i, "").trim();
}

function parseValidPhoneNumber(raw: string, country?: CountryCode) {
  try {
    const parsed = country ? parsePhoneNumber(raw, country) : parsePhoneNumber(raw);
    return parsed?.isValid() ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizePhoneNumber(
  raw: string | null | undefined,
  defaultCountry?: string,
): NormalizedPhone | null {
  const stripped = stripKnownProviderPrefix(raw?.trim() ?? "");
  if (!stripped) return null;

  const e164Parsed = stripped.startsWith("+")
    ? parseValidPhoneNumber(stripped)
    : null;
  const parsed =
    e164Parsed ??
    parseValidPhoneNumber(
      stripped,
      (defaultCountry ?? process.env.DEFAULT_PHONE_REGION ?? "US").toUpperCase() as CountryCode,
    );
  if (!parsed) return null;
  return {
    raw: raw ?? stripped,
    e164: parsed.number,
  };
}

function addIndexEntry(
  index: ContactPhoneIndex,
  phone: string | null | undefined,
  source: PhoneMatchSource,
): void {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return;
  const bucket = index.get(normalized.e164);
  if (bucket) {
    if (!bucket.some((item) => item.contactId === source.contactId && item.via === source.via)) {
      bucket.push(source);
    }
  } else {
    index.set(normalized.e164, [source]);
  }
}

export function buildContactPhoneIndex(
  records: ContactCardRecord[],
): ContactPhoneIndex {
  const index: ContactPhoneIndex = new Map();
  for (const record of records) {
    addIndexEntry(index, record.contact.phone, {
      contactId: record.contact.id,
      via: "contact.phone",
    });

    for (const application of record.applications) {
      const rawPhone = application.answers?.phone;
      if (typeof rawPhone !== "string") continue;
      addIndexEntry(index, rawPhone, {
        contactId: record.contact.id,
        via: `application:${application.id}.phone`,
      });
    }
  }
  return index;
}

export function matchContactByPhone(
  index: ContactPhoneIndex,
  rawPhone: string,
): ContactPhoneMatch {
  const normalized = normalizePhoneNumber(rawPhone);
  const e164 = normalized?.e164 ?? rawPhone;
  const matches = normalized ? index.get(normalized.e164) ?? [] : [];
  if (matches.length === 0) {
    return { status: "unmatched", e164 };
  }

  const contactIds = Array.from(new Set(matches.map((match) => match.contactId)));
  if (contactIds.length > 1) {
    return {
      status: "ambiguous",
      e164,
      contactIds,
      matchedVia: matches,
    };
  }

  return {
    status: "matched",
    e164,
    contactId: contactIds[0]!,
    matchedVia: matches[0]!.via,
  };
}
