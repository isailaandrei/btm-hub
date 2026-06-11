import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import type {
  Application,
  Contact,
  ContactNote,
} from "@/types/database";

export type ContactCardTag = {
  tagId: string;
  tagName: string;
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

type ContactTagJoinRow = {
  contact_id: string;
  tag_id: string;
  assigned_at: string | null;
  tags: Array<{ id: string; name: string }> | { id: string; name: string } | null;
};

function readJoinedTagName(row: ContactTagJoinRow): string | null {
  if (Array.isArray(row.tags)) return row.tags[0]?.name ?? null;
  return row.tags?.name ?? null;
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

async function loadRecordsForContactIds(
  supabase: SupabaseClient,
  contactIds: string[],
  applicationRows?: Application[],
): Promise<ContactCardRecord[]> {
  if (contactIds.length === 0) return [];

  const [
    { data: contactData, error: contactError },
    applicationResult,
    { data: noteData, error: noteError },
    { data: tagData, error: tagError },
    { data: digestData, error: digestError },
    { data: factData, error: factError },
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("*")
      .in("id", contactIds)
      .order("name", { ascending: true }),
    applicationRows
      ? Promise.resolve({ data: applicationRows, error: null })
      : supabase
          .from("applications")
          .select("*")
          .in("contact_id", contactIds)
          .order("submitted_at", { ascending: false }),
    supabase
      .from("contact_events")
      .select("id, contact_id, author_id, author_name, body, created_at")
      .in("contact_id", contactIds)
      .eq("type", "note")
      .neq("body", "")
      .order("created_at", { ascending: true }),
    supabase
      .from("contact_tags")
      .select("contact_id, tag_id, assigned_at, tags(id, name)")
      .in("contact_id", contactIds)
      .order("assigned_at", { ascending: true }),
    supabase
      .from("conversation_digests")
      .select(
        "id, contact_id, source, window_start, window_end, summary, source_message_count",
      )
      .in("contact_id", contactIds)
      .order("window_end", { ascending: false }),
    // Intentionally read the append-only ledger instead of a current-facts view:
    // raw contact cards must surface conflicts, not collapse them away.
    supabase
      .from("conversation_facts")
      .select(
        "id, contact_id, source, field_key, value_text, confidence, observed_at, conflict_group",
      )
      .in("contact_id", contactIds)
      .is("invalidated_at", null)
      .order("observed_at", { ascending: false }),
  ]);

  if (contactError) {
    throw new Error(`Failed to load contacts for cards: ${contactError.message}`);
  }
  if (applicationResult.error) {
    throw new Error(
      `Failed to load applications for cards: ${applicationResult.error.message}`,
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

  const requestedIds = new Set(contactIds);
  const contacts = ((contactData ?? []) as Contact[]).filter((contact) =>
    requestedIds.has(contact.id),
  );
  const applications = (applicationResult.data ?? []) as Application[];
  const notes = ((noteData ?? []) as Array<{
    id: string;
    contact_id: string;
    author_id: string;
    author_name: string;
    body: string;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    contact_id: row.contact_id,
    author_id: row.author_id,
    author_name: row.author_name,
    text: row.body,
    created_at: row.created_at,
  }));
  const tags = ((tagData ?? []) as ContactTagJoinRow[])
    .map((row) => ({
      contactId: row.contact_id,
      tagId: row.tag_id,
      tagName: readJoinedTagName(row),
      assignedAt: row.assigned_at,
    }))
    .filter(
      (row): row is {
        contactId: string;
        tagId: string;
        tagName: string;
        assignedAt: string | null;
      } => Boolean(row.tagName),
    );

  const applicationsByContact = groupByContactId(applications);
  const notesByContact = groupByContactId(notes);
  const tagsByContact = new Map<string, ContactCardTag[]>();
  for (const tag of tags) {
    const item: ContactCardTag = {
      tagId: tag.tagId,
      tagName: tag.tagName,
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
