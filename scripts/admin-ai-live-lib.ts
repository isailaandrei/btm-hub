/**
 * Shared prod-DB loader + renderer for the admin-AI live scripts (the payload
 * analyzer and the eval harness). NOT a test file (no `.test` suffix) so vitest
 * does not collect it as a suite.
 *
 * Reads the service-role DB from `.env.development.local` at runtime — this is a
 * dev/eval-only module and must never be imported from app/runtime code. Mirrors
 * `loadEligibleContactCardRecords` / `loadRecordsForContactIds` (queries,
 * ordering, per-contact caps).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  renderContactCard,
  type RenderedContactCard,
} from "@/lib/admin-ai/contact-card";
import { EvidenceAliasRegistry } from "@/lib/admin-ai/evidence-alias";
import {
  signalDigestFreshnessCutoff,
  type ContactCardRecord,
  type ContactCardTag,
} from "@/lib/data/contact-cards";
import type { Application, Contact } from "@/types/database";

const CONTACT_CARD_ID_CHUNK_SIZE = 100;
const CONVERSATION_DIGESTS_PER_CONTACT_LIMIT = 200;
const CONVERSATION_FACTS_PER_CONTACT_LIMIT = 400;

export function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

export type LiveSupabaseClient = ReturnType<typeof createClient>;

export function createLiveSupabaseClient(
  env: Record<string, string>,
): LiveSupabaseClient {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function pushTo<T>(map: Map<string, T[]>, key: string, value: T): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

type JoinedTag = {
  id: string;
  name: string;
  tag_categories?: Array<{ name: string }> | { name: string } | null;
};

function readJoinedTag(row: {
  tags: JoinedTag[] | JoinedTag | null;
}): { name: string; categoryName: string | null } | null {
  const tag = Array.isArray(row.tags) ? row.tags[0] : row.tags;
  if (!tag?.name) return null;
  const category = Array.isArray(tag.tag_categories)
    ? tag.tag_categories[0]
    : tag.tag_categories;
  return { name: tag.name, categoryName: category?.name ?? null };
}

export async function loadRecords(
  supabase: LiveSupabaseClient,
  contactIds: string[],
  applicationRows?: Application[],
): Promise<ContactCardRecord[]> {
  const uniqueIds = Array.from(new Set(contactIds));
  if (uniqueIds.length === 0) return [];

  const chunks = await Promise.all(
    chunk(uniqueIds, CONTACT_CARD_ID_CHUNK_SIZE).map(async (ids) => {
      const [contacts, apps, notes, tags, digests, facts] = await Promise.all([
        supabase.from("contacts").select("*").in("id", ids)
          .order("created_at", { ascending: true }).order("id", { ascending: true }),
        applicationRows
          ? Promise.resolve({ data: [] as unknown[], error: null })
          : supabase.from("applications").select("*").in("contact_id", ids)
              .order("submitted_at", { ascending: false }),
        supabase.from("contact_events")
          .select("id, contact_id, author_id, author_name, body, created_at, type")
          .in("contact_id", ids).in("type", ["note", "call", "message"]).neq("body", "")
          .order("created_at", { ascending: true }),
        supabase.from("contact_tags")
          .select("contact_id, tag_id, assigned_at, tags(id, name, tag_categories(name))")
          .in("contact_id", ids).order("assigned_at", { ascending: true }),
        // Mirrors contact-cards.ts: read the correction-overlaid read-model so
        // the eval/live scripts see the same corrected labels the AI does.
        supabase.from("conversation_digests_effective")
          .select("id, contact_id, source, window_start, window_end, summary, source_message_count")
          .in("contact_id", ids).eq("is_noise", false)
          .or(`relevance.eq.profile,window_end.gte.${signalDigestFreshnessCutoff()}`)
          .order("window_end", { ascending: false }),
        supabase.from("conversation_facts")
          .select("id, contact_id, source, field_key, value_text, confidence, observed_at, conflict_group")
          .in("contact_id", ids).is("invalidated_at", null)
          .order("observed_at", { ascending: false }),
      ]);
      for (const r of [contacts, apps, notes, tags, digests, facts]) {
        if (r.error) throw new Error(r.error.message);
      }
      return {
        contacts: (contacts.data ?? []) as Contact[],
        apps: (apps.data ?? []) as Application[],
        notes: (notes.data ?? []) as Array<Record<string, string>>,
        tags: (tags.data ?? []) as Array<Record<string, unknown>>,
        digests: (digests.data ?? []) as Array<Record<string, unknown>>,
        facts: (facts.data ?? []) as Array<Record<string, unknown>>,
      };
    }),
  );

  const requested = new Set(uniqueIds);
  const contacts = chunks.flatMap((c) => c.contacts)
    .filter((c) => requested.has(c.id))
    .sort((a, b) =>
      Date.parse(a.created_at) - Date.parse(b.created_at) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const applications = applicationRows ?? chunks.flatMap((c) => c.apps);
  const notes = chunks.flatMap((c) => c.notes).map((row) => ({
    id: row.id, contact_id: row.contact_id, author_id: row.author_id,
    author_name: row.author_name, text: row.body, created_at: row.created_at,
    eventType: row.type as "note" | "call" | "message",
  }));

  const appsByContact = new Map<string, Application[]>();
  for (const a of applications) if (a.contact_id) pushTo(appsByContact, a.contact_id, a);
  const notesByContact = new Map<string, (typeof notes)[number][]>();
  for (const n of notes) if (n.contact_id) pushTo(notesByContact, n.contact_id, n);

  const tagsByContact = new Map<string, ContactCardTag[]>();
  for (const row of chunks.flatMap((c) => c.tags)) {
    const joined = readJoinedTag(row as never);
    if (!joined) continue;
    pushTo(tagsByContact, row.contact_id as string, {
      tagId: row.tag_id as string, tagName: joined.name,
      categoryName: joined.categoryName,
      assignedAt: (row.assigned_at as string) ?? null,
    });
  }
  const digestsByContact = new Map<string, NonNullable<ContactCardRecord["conversationDigests"]>>();
  for (const row of chunks.flatMap((c) => c.digests)) {
    pushTo(digestsByContact, row.contact_id as string, {
      id: row.id as string, contactId: row.contact_id as string, source: row.source as string,
      windowStart: row.window_start as string, windowEnd: row.window_end as string,
      summary: row.summary as string, sourceMessageCount: row.source_message_count as number,
    });
  }
  const factsByContact = new Map<string, NonNullable<ContactCardRecord["conversationFacts"]>>();
  for (const row of chunks.flatMap((c) => c.facts)) {
    pushTo(factsByContact, row.contact_id as string, {
      id: row.id as string, contactId: row.contact_id as string, source: row.source as string,
      fieldKey: (row.field_key as string) ?? null, valueText: row.value_text as string,
      confidence: (row.confidence as string) ?? null, observedAt: (row.observed_at as string) ?? null,
      conflictGroup: (row.conflict_group as string) ?? null,
    });
  }

  return contacts.map((contact) => ({
    contact,
    applications: appsByContact.get(contact.id) ?? [],
    contactNotes: notesByContact.get(contact.id) ?? [],
    contactTags: tagsByContact.get(contact.id) ?? [],
    conversationDigests: (digestsByContact.get(contact.id) ?? []).slice(0, CONVERSATION_DIGESTS_PER_CONTACT_LIMIT),
    conversationFacts: (factsByContact.get(contact.id) ?? []).slice(0, CONVERSATION_FACTS_PER_CONTACT_LIMIT),
  }));
}

export async function loadEligible(
  supabase: LiveSupabaseClient,
): Promise<ContactCardRecord[]> {
  const { data, error } = await supabase.from("applications").select("*")
    .not("contact_id", "is", null).order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);
  const applications = (data ?? []) as Application[];
  const contactIds = Array.from(new Set(
    applications.map((a) => a.contact_id).filter((id): id is string => Boolean(id)),
  ));
  return loadRecords(supabase, contactIds, applications);
}

/**
 * Render records to cards exactly as the orchestrator does: when evidence is off
 * it strips inline `[eN]` anchors and clears the per-card evidence arrays.
 */
export function renderRecordsForLive(
  records: ContactCardRecord[],
  options: { includeEvidence: boolean },
): RenderedContactCard[] {
  const registry = new EvidenceAliasRegistry();
  const cards = records.map((record) => renderContactCard(record, registry));
  if (options.includeEvidence) return cards;
  return cards.map((card) => ({
    ...card,
    text: card.text.replace(/\s+\[e\d+\]/g, ""),
    evidence: [],
  }));
}
