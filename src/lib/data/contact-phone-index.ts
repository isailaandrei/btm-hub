import { createAdminClient } from "@/lib/supabase/admin";
import type { Application, Contact } from "@/types/database";
import type { ContactCardRecord } from "./contact-cards";

const PHONE_INDEX_CACHE_TTL_MS = 60_000;

// Bound these reads so a saturated database can't hang the WhatsApp webhook that
// calls this on a cache miss. Matching is best-effort there, so a timeout just
// stores the message unmatched rather than holding a Fluid instance open. See
// the Jun 2026 webhook Fluid-burn incident.
const PHONE_INDEX_DB_TIMEOUT_MS = 5000;

let phoneIndexCache: {
  expiresAt: number;
  records: ContactCardRecord[];
} | null = null;

function groupApplicationsByContactId(
  applications: Application[],
): Map<string, Application[]> {
  const grouped = new Map<string, Application[]>();
  for (const application of applications) {
    if (!application.contact_id) continue;
    const bucket = grouped.get(application.contact_id);
    if (bucket) bucket.push(application);
    else grouped.set(application.contact_id, [application]);
  }
  return grouped;
}

export async function loadContactPhoneIndexRecords(): Promise<ContactCardRecord[]> {
  const now = Date.now();
  if (phoneIndexCache && phoneIndexCache.expiresAt > now) {
    return phoneIndexCache.records;
  }

  const supabase = await createAdminClient();
  const [
    { data: contactData, error: contactError },
    { data: applicationData, error: applicationError },
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, name, email, phone, profile_id, created_at, updated_at")
      .order("name", { ascending: true })
      .abortSignal(AbortSignal.timeout(PHONE_INDEX_DB_TIMEOUT_MS)),
    supabase
      .from("applications")
      .select(
        "id, user_id, contact_id, program, status, answers, tags, admin_notes, submitted_at, updated_at",
      )
      .not("contact_id", "is", null)
      .order("submitted_at", { ascending: false })
      .abortSignal(AbortSignal.timeout(PHONE_INDEX_DB_TIMEOUT_MS)),
  ]);

  if (contactError) {
    throw new Error(
      `Failed to load contacts for phone matching: ${contactError.message}`,
    );
  }
  if (applicationError) {
    throw new Error(
      `Failed to load applications for phone matching: ${applicationError.message}`,
    );
  }

  const contacts = (contactData ?? []) as Contact[];
  const applicationsByContact = groupApplicationsByContactId(
    (applicationData ?? []) as Application[],
  );
  const records = contacts.map((contact) => ({
    contact,
    applications: applicationsByContact.get(contact.id) ?? [],
    contactNotes: [],
    contactTags: [],
  }));

  phoneIndexCache = {
    expiresAt: now + PHONE_INDEX_CACHE_TTL_MS,
    records,
  };
  return records;
}
