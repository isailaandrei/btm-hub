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

// ---------------------------------------------------------------------------
// Digit-suffix matcher (robust to formatting / country-code variance).
//
// libphonenumber-based E.164 matching fails whenever a stored number can't be
// parsed to the same canonical form (a national number without the right
// default region, a "00"-prefixed international number, stray punctuation) — the
// cause of ~280 real WhatsApp messages sitting unmatched. This matcher works on
// bare digit strings instead: exact equality first, then a last-9-digit suffix
// match guarded by uniqueness so a shared tail never mis-links two contacts.
// ---------------------------------------------------------------------------

// The national significant number is >= 9 digits in every region we serve;
// matching on a shorter tail risks colliding unrelated numbers.
const PHONE_MATCH_MIN_DIGITS = 9;

/**
 * Reduce a phone value to a bare digit string: strip every non-digit, then drop
 * a leading "00" international-call prefix. Returns null when no digits remain.
 */
export function normalizePhoneDigits(
  raw: string | null | undefined,
): string | null {
  if (raw === null || raw === undefined) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length > 0 ? digits : null;
}

export type ContactDigitIndex = {
  /** Full normalized digit string → sources. */
  exact: Map<string, PhoneMatchSource[]>;
  /** Last-9-digit suffix → sources (used only when exact misses). */
  suffix: Map<string, PhoneMatchSource[]>;
};

function pushDigitSource(
  bucketMap: Map<string, PhoneMatchSource[]>,
  key: string,
  source: PhoneMatchSource,
): void {
  const bucket = bucketMap.get(key);
  if (bucket) {
    if (
      !bucket.some(
        (item) => item.contactId === source.contactId && item.via === source.via,
      )
    ) {
      bucket.push(source);
    }
  } else {
    bucketMap.set(key, [source]);
  }
}

function addDigitEntry(
  index: ContactDigitIndex,
  phone: string | null | undefined,
  source: PhoneMatchSource,
): void {
  const digits = normalizePhoneDigits(phone);
  // Never index a number too short to match — it can only produce collisions.
  if (!digits || digits.length < PHONE_MATCH_MIN_DIGITS) return;
  pushDigitSource(index.exact, digits, source);
  pushDigitSource(index.suffix, digits.slice(-PHONE_MATCH_MIN_DIGITS), source);
}

export function buildContactDigitIndex(
  records: ContactCardRecord[],
): ContactDigitIndex {
  const index: ContactDigitIndex = { exact: new Map(), suffix: new Map() };
  for (const record of records) {
    addDigitEntry(index, record.contact.phone, {
      contactId: record.contact.id,
      via: "contact.phone",
    });
    for (const application of record.applications) {
      const rawPhone = application.answers?.phone;
      if (typeof rawPhone !== "string") continue;
      addDigitEntry(index, rawPhone, {
        contactId: record.contact.id,
        via: `application:${application.id}.phone`,
      });
    }
  }
  return index;
}

function uniqueContactIds(sources: PhoneMatchSource[]): string[] {
  return Array.from(new Set(sources.map((source) => source.contactId)));
}

/**
 * Match a raw phone value to a contact via the digit index. Order:
 *   (a) exact normalized equality — unique → matched, shared → ambiguous;
 *   (b) last-9-digit suffix — matched ONLY when the suffix maps to exactly one
 *       contact (a shared tail is refused with a warning, never guessed).
 * Numbers shorter than 9 digits are never matched.
 */
export function matchContactByDigits(
  index: ContactDigitIndex,
  rawPhone: string,
): ContactPhoneMatch {
  const digits = normalizePhoneDigits(rawPhone);
  if (!digits || digits.length < PHONE_MATCH_MIN_DIGITS) {
    return { status: "unmatched", e164: digits ?? rawPhone };
  }

  const exact = index.exact.get(digits) ?? [];
  if (exact.length > 0) {
    const contactIds = uniqueContactIds(exact);
    if (contactIds.length === 1) {
      return {
        status: "matched",
        e164: digits,
        contactId: contactIds[0]!,
        matchedVia: exact[0]!.via,
      };
    }
    return { status: "ambiguous", e164: digits, contactIds, matchedVia: exact };
  }

  const suffix = index.suffix.get(digits.slice(-PHONE_MATCH_MIN_DIGITS)) ?? [];
  const suffixContactIds = uniqueContactIds(suffix);
  if (suffixContactIds.length === 1) {
    return {
      status: "matched",
      e164: digits,
      contactId: suffixContactIds[0]!,
      matchedVia: `suffix9:${suffix[0]!.via}`,
    };
  }
  if (suffixContactIds.length > 1) {
    // A shared tail across contacts is genuinely ambiguous — refuse to guess.
    console.warn("[phone] suffix collision — refusing to match", {
      suffix: digits.slice(-PHONE_MATCH_MIN_DIGITS),
      contactIds: suffixContactIds,
    });
  }
  return { status: "unmatched", e164: digits };
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
