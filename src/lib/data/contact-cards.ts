import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import type {
  Application,
  Contact,
  ContactNote,
} from "@/types/database";

/**
 * How long a STATUS conversation digest stays in the AI's view after its window
 * closes (roughly one trip cycle). Profile digests never age out. The eval
 * live-lib mirror imports this so both read paths agree.
 */
export const STATUS_DIGEST_FRESHNESS_DAYS = 45;

/**
 * ISO cutoff for status-digest freshness: digests whose `window_end` is at or
 * after this are still visible to the AI. Injectable `now` for tests.
 */
export function signalDigestFreshnessCutoff(now: number = Date.now()): string {
  return new Date(
    now - STATUS_DIGEST_FRESHNESS_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

export type ContactCardTag = {
  tagId: string;
  tagName: string;
  /**
   * Tag-category name (e.g. "26 Coral Catch"). Categories name programs /
   * cohorts / trips; the same tag name ("Potential Candidate", "Interested")
   * repeats across categories, so a bare tag name is ambiguous without it.
   */
  categoryName: string | null;
  assignedAt: string | null;
};

export type ContactCardConversationDigest = {
  id: string;
  contactId: string;
  source: string;
  windowStart: string;
  windowEnd: string;
  summary: string;
  sourceMessageCount: number;
};

export type ContactCardConversationFact = {
  id: string;
  contactId: string;
  fieldKey: string | null;
  valueText: string;
  source: string;
  observedAt: string | null;
  confidence: string | null;
  conflictGroup: string | null;
};

export type ContactCardRecord = {
  contact: Contact;
  applications: Application[];
  contactNotes: ContactNote[];
  contactTags: ContactCardTag[];
  conversationDigests?: ContactCardConversationDigest[];
  conversationFacts?: ContactCardConversationFact[];
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const CONVERSATION_DIGESTS_PER_CONTACT_LIMIT = 200;
const CONVERSATION_FACTS_PER_CONTACT_LIMIT = 400;

// PostgREST encodes `.in()` filters in the request URL; ~37 chars per UUID
// against the API gateway's ~8KB URI limit means unbounded id lists 414.
// 100 ids ≈ 3.8KB, leaving room for the rest of the query string.
export const CONTACT_CARD_ID_CHUNK_SIZE = 100;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

type JoinedTag = {
  id: string;
  name: string;
  tag_categories?: Array<{ name: string }> | { name: string } | null;
};

type ContactTagJoinRow = {
  contact_id: string;
  tag_id: string;
  assigned_at: string | null;
  tags: JoinedTag[] | JoinedTag | null;
};

function readJoinedTag(
  row: ContactTagJoinRow,
): { name: string; categoryName: string | null } | null {
  const tag = Array.isArray(row.tags) ? row.tags[0] : row.tags;
  if (!tag?.name) return null;
  const category = Array.isArray(tag.tag_categories)
    ? tag.tag_categories[0]
    : tag.tag_categories;
  return { name: tag.name, categoryName: category?.name ?? null };
}

function groupByContactId<T extends { contact_id: string | null }>(
  rows: T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.contact_id) continue;
    const bucket = grouped.get(row.contact_id);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(row.contact_id, [row]);
    }
  }
  return grouped;
}

type ContactCardChunkRows = {
  contactData: unknown[];
  applicationData: unknown[];
  noteData: unknown[];
  tagData: unknown[];
  digestData: unknown[];
  factData: unknown[];
};

async function loadChunkRows(
  supabase: SupabaseClient,
  chunkIds: string[],
  skipApplications: boolean,
): Promise<ContactCardChunkRows> {
  const [
    { data: contactData, error: contactError },
    { data: applicationData, error: applicationError },
    { data: noteData, error: noteError },
    { data: tagData, error: tagError },
    { data: digestData, error: digestError },
    { data: factData, error: factError },
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("*")
      .in("id", chunkIds)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    skipApplications
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("applications")
          .select("*")
          .in("contact_id", chunkIds)
          .order("submitted_at", { ascending: false }),
    supabase
      .from("contact_events")
      .select("id, contact_id, author_id, author_name, body, created_at, type")
      .in("contact_id", chunkIds)
      .in("type", ["note", "call", "message"])
      .neq("body", "")
      .order("created_at", { ascending: true }),
    supabase
      .from("contact_tags")
      .select("contact_id, tag_id, assigned_at, tags(id, name, tag_categories(name))")
      .in("contact_id", chunkIds)
      .order("assigned_at", { ascending: true }),
    supabase
      // Reads the correction-overlaid read-model (conversation_digests
      // migration 20260709000001) so an admin's "wrong label?" correction
      // takes effect for the AI corpus immediately, without mutating the
      // original digest row.
      .from("conversation_digests_effective")
      .select(
        "id, contact_id, source, window_start, window_end, summary, source_message_count",
      )
      .in("contact_id", chunkIds)
      // Noise-marker digests never render; status digests age out after the
      // freshness window, profile digests stay permanently.
      .eq("is_noise", false)
      .or(`relevance.eq.profile,window_end.gte.${signalDigestFreshnessCutoff()}`)
      .order("window_end", { ascending: false }),
    // Intentionally read the append-only ledger instead of a current-facts view:
    // raw contact cards must surface conflicts, not collapse them away.
    supabase
      .from("conversation_facts")
      .select(
        "id, contact_id, source, field_key, value_text, confidence, observed_at, conflict_group",
      )
      .in("contact_id", chunkIds)
      .is("invalidated_at", null)
      .order("observed_at", { ascending: false }),
  ]);

  if (contactError) {
    throw new Error(`Failed to load contacts for cards: ${contactError.message}`);
  }
  if (applicationError) {
    throw new Error(
      `Failed to load applications for cards: ${applicationError.message}`,
    );
  }
  if (noteError) {
    throw new Error(`Failed to load contact notes for cards: ${noteError.message}`);
  }
  if (tagError) {
    throw new Error(`Failed to load contact tags for cards: ${tagError.message}`);
  }
  if (digestError) {
    throw new Error(
      `Failed to load conversation digests for cards: ${digestError.message}`,
    );
  }
  if (factError) {
    throw new Error(
      `Failed to load conversation facts for cards: ${factError.message}`,
    );
  }

  return {
    contactData: contactData ?? [],
    applicationData: applicationData ?? [],
    noteData: noteData ?? [],
    tagData: tagData ?? [],
    digestData: digestData ?? [],
    factData: factData ?? [],
  };
}

async function loadRecordsForContactIds(
  supabase: SupabaseClient,
  contactIds: string[],
  applicationRows?: Application[],
): Promise<ContactCardRecord[]> {
  const uniqueIds = Array.from(new Set(contactIds));
  if (uniqueIds.length === 0) return [];

  // PostgREST `.in()` filters live in the request URL, so the id list must be
  // chunked or large cohorts blow the gateway's URI limit (HTTP 414). All rows
  // for a contact land in its own chunk, so per-contact groupings are intact.
  const chunkResults = await Promise.all(
    chunkArray(uniqueIds, CONTACT_CARD_ID_CHUNK_SIZE).map((chunkIds) =>
      loadChunkRows(supabase, chunkIds, Boolean(applicationRows)),
    ),
  );

  const contactData = chunkResults.flatMap((chunk) => chunk.contactData);
  const noteData = chunkResults.flatMap((chunk) => chunk.noteData);
  const tagData = chunkResults.flatMap((chunk) => chunk.tagData);
  const digestData = chunkResults.flatMap((chunk) => chunk.digestData);
  const factData = chunkResults.flatMap((chunk) => chunk.factData);

  const requestedIds = new Set(uniqueIds);
  const contacts = (contactData as Contact[])
    .filter((contact) => requestedIds.has(contact.id))
    // Oldest-first + id tiebreaker: a stable, append-only order so new
    // contacts land at the tail and preserve the cached prompt prefix
    // (and volatile recent contacts sit at the end, minimizing invalidation).
    // Chunked queries only order within a chunk, so re-sort globally here.
    .sort(
      (a, b) =>
        Date.parse(a.created_at) - Date.parse(b.created_at) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const applications =
    applicationRows ??
    (chunkResults.flatMap((chunk) => chunk.applicationData) as Application[]);
  const notes = ((noteData ?? []) as Array<{
    id: string;
    contact_id: string;
    author_id: string;
    author_name: string;
    body: string;
    created_at: string;
    type: "note" | "call" | "message";
  }>).map((row) => ({
    id: row.id,
    contact_id: row.contact_id,
    author_id: row.author_id,
    author_name: row.author_name,
    text: row.body,
    created_at: row.created_at,
    eventType: row.type,
  }));
  const tags = ((tagData ?? []) as ContactTagJoinRow[]).flatMap((row) => {
    const joined = readJoinedTag(row);
    if (!joined) return [];
    return [
      {
        contactId: row.contact_id,
        tagId: row.tag_id,
        tagName: joined.name,
        categoryName: joined.categoryName,
        assignedAt: row.assigned_at,
      },
    ];
  });

  const applicationsByContact = groupByContactId(applications);
  const notesByContact = groupByContactId(notes);
  const tagsByContact = new Map<string, ContactCardTag[]>();
  for (const tag of tags) {
    const item: ContactCardTag = {
      tagId: tag.tagId,
      tagName: tag.tagName,
      categoryName: tag.categoryName,
      assignedAt: tag.assignedAt,
    };
    const bucket = tagsByContact.get(tag.contactId);
    if (bucket) bucket.push(item);
    else tagsByContact.set(tag.contactId, [item]);
  }
  const digestsByContact = new Map<string, ContactCardConversationDigest[]>();
  for (const row of (digestData ?? []) as Array<{
    id: string;
    contact_id: string;
    source: string;
    window_start: string;
    window_end: string;
    summary: string;
    source_message_count: number;
  }>) {
    const digest = {
      id: row.id,
      contactId: row.contact_id,
      source: row.source,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      summary: row.summary,
      sourceMessageCount: row.source_message_count,
    };
    const bucket = digestsByContact.get(row.contact_id);
    if (bucket) bucket.push(digest);
    else digestsByContact.set(row.contact_id, [digest]);
  }

  const factsByContact = new Map<string, ContactCardConversationFact[]>();
  for (const row of (factData ?? []) as Array<{
    id: string;
    contact_id: string;
    source: string;
    field_key: string | null;
    value_text: string;
    confidence: string | null;
    observed_at: string | null;
    conflict_group: string | null;
  }>) {
    const fact = {
      id: row.id,
      contactId: row.contact_id,
      source: row.source,
      fieldKey: row.field_key,
      valueText: row.value_text,
      confidence: row.confidence,
      observedAt: row.observed_at,
      conflictGroup: row.conflict_group,
    };
    const bucket = factsByContact.get(row.contact_id);
    if (bucket) bucket.push(fact);
    else factsByContact.set(row.contact_id, [fact]);
  }

  return contacts.map((contact) => ({
    contact,
    applications: applicationsByContact.get(contact.id) ?? [],
    contactNotes: notesByContact.get(contact.id) ?? [],
    contactTags: tagsByContact.get(contact.id) ?? [],
    conversationDigests: (digestsByContact.get(contact.id) ?? []).slice(
      0,
      CONVERSATION_DIGESTS_PER_CONTACT_LIMIT,
    ),
    conversationFacts: (factsByContact.get(contact.id) ?? []).slice(
      0,
      CONVERSATION_FACTS_PER_CONTACT_LIMIT,
    ),
  }));
}

export const loadContactCardRecords = cache(
  async function loadContactCardRecords(input: {
    contactIds: string[];
  }): Promise<ContactCardRecord[]> {
    await requireAdmin();
    const supabase = await createClient();
    return loadRecordsForContactIds(supabase, input.contactIds);
  },
);

export const loadEligibleContactCardRecords = cache(
  async function loadEligibleContactCardRecords(): Promise<ContactCardRecord[]> {
    await requireAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .not("contact_id", "is", null)
      .order("submitted_at", { ascending: false });

    if (error) {
      throw new Error(
        `Failed to load eligible applications for cards: ${error.message}`,
      );
    }

    const applications = (data ?? []) as Application[];
    const contactIds = Array.from(
      new Set(
        applications
          .map((application) => application.contact_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    return loadRecordsForContactIds(supabase, contactIds, applications);
  },
);
