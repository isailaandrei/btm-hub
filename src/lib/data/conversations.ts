import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ConversationDirection,
  ConversationProvider,
  ConversationSource,
} from "@/lib/conversations/ingestion/adapter";

// Webhook ingestion runs on every inbound/outbound WhatsApp event. Bound each
// DB round-trip so a saturated database fails fast instead of hanging until the
// function's max duration — under load, an unbounded await holds a Fluid
// instance (and a Postgres connection) open for minutes. See the Jun 2026
// WhatsApp-webhook Fluid-burn incident.
const INGEST_DB_TIMEOUT_MS = 5000;

export type ConversationMessageMatchStatus =
  | "matched"
  | "unmatched"
  | "ambiguous";

export type UpsertConversationMessageInput = {
  contactId: string | null;
  source: ConversationSource;
  provider: ConversationProvider;
  providerMessageId: string;
  direction: ConversationDirection;
  fromIdentifier: string;
  toIdentifier: string;
  body: string;
  media: Array<{ url: string; contentType: string | null }>;
  happenedAt: string;
  rawPayload: Record<string, unknown>;
  matchStatus: ConversationMessageMatchStatus;
  matchedVia: string | null;
};

export type UpdateConversationMessageMatchInput = {
  messageId: string;
  contactId: string | null;
  matchStatus: ConversationMessageMatchStatus;
  matchedVia: string | null;
  rawPayload: Record<string, unknown>;
};

export type ContactConversationMessage = {
  id: string;
  direction: ConversationDirection;
  body: string;
  media: Array<{ url: string; contentType: string | null }>;
  fromIdentifier: string;
  toIdentifier: string;
  happenedAt: string;
  matchStatus: ConversationMessageMatchStatus;
  deactivatedAt: string | null;
};

type ContactConversationMessageRow = {
  id: string;
  direction: ConversationDirection;
  body: string;
  media_json: unknown;
  from_identifier: string;
  to_identifier: string;
  happened_at: string;
  match_status: ConversationMessageMatchStatus;
  deactivated_at: string | null;
};

export type ConversationFactInput = {
  contactId: string;
  source: ConversationSource;
  fieldKey: string | null;
  valueText: string;
  valueJson: unknown;
  confidence: string;
  sourceMessageIds: string[];
  observedAt: string;
  conflictGroup: string | null;
  extractorModel: string;
  extractorVersion: string;
};

export type ConversationDigestInput = {
  contactId: string;
  source: ConversationSource;
  windowStart: string;
  windowEnd: string;
  firstMessageId: string;
  lastMessageId: string;
  summary: string;
  sourceMessageCount: number;
  contentHash: string;
  generatorModel: string;
  generatorVersion: string;
  /** Noise-marker windows (no CRM signal): empty summary, filtered from cards. */
  isNoise: boolean;
  /** 'profile' (durable) | 'status' (short-lived) for signal rows; null for noise. */
  relevance: "profile" | "status" | null;
};

export type ConversationEmbeddingInput = {
  targetType: "message";
  targetId: string;
  embeddingModel: string;
  embeddingVersion: string;
  contentHash: string;
  embedding: number[];
};

export type ConversationEvidenceHit = {
  messageId: string;
  contactId: string | null;
  body: string;
  happenedAt: string | null;
  score: number;
};

export type ConversationDigestMessage = {
  id: string;
  contactId: string;
  direction: ConversationDirection;
  body: string;
  happenedAt: string;
};

export type ConversationEmbeddingMessage = {
  id: string;
  body: string;
};

type MessageRow = {
  id: string;
  contact_id: string | null;
};

type ConversationSearchRow = {
  message_id: string;
  contact_id: string | null;
  body: string;
  happened_at: string | null;
  similarity?: number;
  rank?: number;
};

type ConversationDigestMessageRow = {
  id: string;
  contact_id: string | null;
  direction: ConversationDirection;
  body: string;
  happened_at: string;
};

type ConversationEmbeddingMessageRow = {
  id: string;
  body: string;
};

export async function upsertConversationMessage(
  input: UpsertConversationMessageInput,
): Promise<{ id: string; contactId: string | null }> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("conversation_messages")
    .upsert(
      [
        {
          contact_id: input.contactId,
          source: input.source,
          provider: input.provider,
          provider_message_id: input.providerMessageId,
          direction: input.direction,
          from_identifier: input.fromIdentifier,
          to_identifier: input.toIdentifier,
          body: input.body,
          media_json: input.media,
          happened_at: input.happenedAt,
          raw_payload: input.rawPayload,
          match_status: input.matchStatus,
          matched_via: input.matchedVia,
        },
      ],
      { onConflict: "provider,provider_message_id" },
    )
    .select("id, contact_id")
    .abortSignal(AbortSignal.timeout(INGEST_DB_TIMEOUT_MS))
    .single();

  if (error) {
    throw new Error(`Failed to upsert conversation message: ${error.message}`);
  }
  const row = data as MessageRow | null;
  if (!row) throw new Error("Failed to upsert conversation message: no row returned");
  return { id: row.id, contactId: row.contact_id };
}

export async function updateConversationMessageMatch(
  input: UpdateConversationMessageMatchInput,
): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("conversation_messages")
    .update({
      contact_id: input.contactId,
      match_status: input.matchStatus,
      matched_via: input.matchedVia,
      raw_payload: input.rawPayload,
    })
    .eq("id", input.messageId)
    .abortSignal(AbortSignal.timeout(INGEST_DB_TIMEOUT_MS));

  if (error) {
    throw new Error(`Failed to update conversation message match: ${error.message}`);
  }
}

const PHONE_E164 = /^\+\d{6,15}$/;

/**
 * Lists a contact's WhatsApp thread: messages linked by `contact_id` plus any
 * to/from the contact's phone number (covers messages received before the
 * contact existed, or left unmatched/ambiguous at receipt). Ordered oldest
 * first for chat rendering.
 *
 * `contactId` must be a validated UUID and `phoneE164` is checked against
 * `PHONE_E164` before interpolation, so the `.or()` filter cannot be abused for
 * PostgREST filter injection.
 */
export async function listContactConversationMessages(input: {
  contactId: string;
  phoneE164?: string | null;
  limit?: number;
}): Promise<ContactConversationMessage[]> {
  const supabase = await createAdminClient();

  const filters = [`contact_id.eq.${input.contactId}`];
  const phone =
    input.phoneE164 && PHONE_E164.test(input.phoneE164) ? input.phoneE164 : null;
  if (phone) {
    filters.push(`from_identifier.eq.${phone}`, `to_identifier.eq.${phone}`);
  }

  const { data, error } = await supabase
    .from("conversation_messages")
    .select(
      "id, direction, body, media_json, from_identifier, to_identifier, happened_at, match_status, deactivated_at",
    )
    .or(filters.join(","))
    .order("happened_at", { ascending: true })
    .limit(input.limit ?? 500);

  if (error) {
    throw new Error(
      `Failed to list contact conversation messages: ${error.message}`,
    );
  }

  return ((data ?? []) as ContactConversationMessageRow[]).map((row) => ({
    id: row.id,
    direction: row.direction,
    body: row.body,
    media: Array.isArray(row.media_json)
      ? (row.media_json as Array<{ url: string; contentType: string | null }>)
      : [],
    fromIdentifier: row.from_identifier,
    toIdentifier: row.to_identifier,
    happenedAt: row.happened_at,
    matchStatus: row.match_status,
    deactivatedAt: row.deactivated_at ?? null,
  }));
}

/**
 * Resolves the stored media URL for one attachment of a message, used by the
 * admin media proxy. Returns null if the message/attachment doesn't exist.
 */
export async function getConversationMessageMediaUrl(
  messageId: string,
  index: number,
): Promise<string | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("media_json")
    .eq("id", messageId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load conversation message media: ${error.message}`);
  }

  const media = (data as { media_json?: unknown } | null)?.media_json;
  if (!Array.isArray(media)) return null;
  const item = media[index] as { url?: unknown } | undefined;
  return item && typeof item.url === "string" ? item.url : null;
}

export type ContactConversationDigest = {
  id: string;
  /** Stable across recalibration re-digests of the identical window — the
   * correction join key (see conversation_digest_corrections). */
  contentHash: string;
  windowStart: string;
  windowEnd: string;
  /** EFFECTIVE label (correction-overlaid, if one exists). */
  isNoise: boolean;
  relevance: "profile" | "status" | null;
  summary: string;
  /** The model's ORIGINAL label, regardless of any correction — the
   * calibration reference point ("corrected from X" in the UI). */
  modelIsNoise: boolean;
  modelRelevance: "profile" | "status" | null;
  /** Set when an admin correction exists for this digest's content hash. */
  correctedAt: string | null;
};

/**
 * All of a contact's digest windows (signal AND noise), newest first — the
 * AI-visibility surfaces need noise rows too, to explain filtered exchanges.
 * Reads `conversation_digests_effective` so admin corrections (see
 * `upsertConversationDigestCorrection`) are already applied to `isNoise` /
 * `relevance` — every consumer of this loader (badges, the AI-memory section)
 * inherits corrections automatically without its own overlay logic.
 */
export async function listContactConversationDigests(
  contactId: string,
): Promise<ContactConversationDigest[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("conversation_digests_effective")
    .select(
      "id, content_hash, window_start, window_end, is_noise, relevance, summary, model_is_noise, model_relevance, correction_created_at",
    )
    .eq("contact_id", contactId)
    .order("window_end", { ascending: false });
  if (error) {
    throw new Error(`Failed to list conversation digests: ${error.message}`);
  }
  return ((data ?? []) as Array<{
    id: string;
    content_hash: string;
    window_start: string;
    window_end: string;
    is_noise: boolean;
    relevance: "profile" | "status" | null;
    summary: string;
    model_is_noise: boolean;
    model_relevance: "profile" | "status" | null;
    correction_created_at: string | null;
  }>).map((row) => ({
    id: row.id,
    contentHash: row.content_hash,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    isNoise: row.is_noise,
    relevance: row.relevance,
    summary: row.summary,
    modelIsNoise: row.model_is_noise,
    modelRelevance: row.model_relevance,
    correctedAt: row.correction_created_at,
  }));
}

export type ConversationDigestCorrectionInput = {
  contentHash: string;
  /** null maps to a noise correction (see correctContactDigestLabel). */
  correctedRelevance: "profile" | "status" | null;
  correctedIsNoise: boolean;
  /** The model's original label — always pass the TRUE original (from
   * `modelRelevance`/`modelIsNoise`), never a previous correction, so
   * re-correcting the same digest doesn't corrupt the calibration dataset. */
  originalRelevance: string | null;
  originalIsNoise: boolean;
  correctedBy: string;
};

/**
 * Records (or replaces) an admin's correction of a digest's label, keyed by
 * content hash so it survives a recalibration wipe + re-digest of the
 * identical window. Never touches `conversation_digests` — the model's
 * original output is data. Every read path overlays this via
 * `conversation_digests_effective`.
 */
export async function upsertConversationDigestCorrection(
  input: ConversationDigestCorrectionInput,
): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("conversation_digest_corrections")
    .upsert(
      [
        {
          content_hash: input.contentHash,
          corrected_relevance: input.correctedRelevance,
          corrected_is_noise: input.correctedIsNoise,
          original_relevance: input.originalRelevance,
          original_is_noise: input.originalIsNoise,
          corrected_by: input.correctedBy,
        },
      ],
      { onConflict: "content_hash" },
    );

  if (error) {
    throw new Error(
      `Failed to upsert conversation digest correction: ${error.message}`,
    );
  }
}

export type ContactConversationCurrentFact = {
  fieldKey: string | null;
  valueText: string;
  confidence: "high" | "medium" | "low";
  observedAt: string;
};

/** Current (non-invalidated, latest per field) facts — the AI's structured memory. */
export async function listContactCurrentConversationFacts(
  contactId: string,
): Promise<ContactConversationCurrentFact[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("conversation_current_facts")
    .select("field_key, value_text, confidence, observed_at")
    .eq("contact_id", contactId)
    .order("observed_at", { ascending: false });
  if (error) {
    throw new Error(`Failed to list conversation facts: ${error.message}`);
  }
  return ((data ?? []) as Array<{
    field_key: string | null;
    value_text: string;
    confidence: "high" | "medium" | "low";
    observed_at: string;
  }>).map((row) => ({
    fieldKey: row.field_key,
    valueText: row.value_text,
    confidence: row.confidence,
    observedAt: row.observed_at,
  }));
}

export interface ArchivedConversationMedia {
  status: "pending" | "stored" | "expired" | "failed";
  storagePath: string | null;
  contentType: string | null;
}

/**
 * Archive-ledger lookup for one attachment (see conversation_media +
 * media-archive.ts). `null` means the attachment hasn't been seeded into the
 * archive queue yet — callers treat that like `pending` (serve from YCloud).
 */
export async function getArchivedConversationMedia(
  messageId: string,
  index: number,
): Promise<ArchivedConversationMedia | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("conversation_media")
    .select("status, storage_path, content_type")
    .eq("message_id", messageId)
    .eq("media_index", index)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load archived media: ${error.message}`);
  }
  if (!data) return null;
  const row = data as {
    status: ArchivedConversationMedia["status"];
    storage_path: string | null;
    content_type: string | null;
  };
  return {
    status: row.status,
    storagePath: row.storage_path,
    contentType: row.content_type,
  };
}

/**
 * Soft-deactivates (or restores) a single conversation message. Deactivated
 * messages drop out of the contact thread's active view and are excluded from
 * every admin-AI read path (retrieval + digest/embedding generation) by the
 * `deactivated_at IS NULL` filters in those RPCs. Reversible — no data removed.
 */
export async function setConversationMessageDeactivated(input: {
  messageId: string;
  deactivated: boolean;
  deactivatedBy: string | null;
}): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("conversation_messages")
    .update({
      deactivated_at: input.deactivated ? new Date().toISOString() : null,
      deactivated_by: input.deactivated ? input.deactivatedBy : null,
    })
    .eq("id", input.messageId);

  if (error) {
    throw new Error(
      `Failed to update conversation message deactivation: ${error.message}`,
    );
  }
}

export async function hasConversationMessages(input?: {
  contactId?: string | null;
}): Promise<boolean> {
  const supabase = await createAdminClient();
  let query = supabase
    .from("conversation_messages")
    .select("id")
    .limit(1);

  if (input?.contactId) {
    query = query.eq("contact_id", input.contactId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Failed to check conversation messages: ${error.message}`);
  }
  return Boolean(data);
}

export async function upsertConversationDigest(
  input: ConversationDigestInput,
): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("conversation_digests")
    .upsert(
      [
        {
          contact_id: input.contactId,
          source: input.source,
          window_start: input.windowStart,
          window_end: input.windowEnd,
          first_message_id: input.firstMessageId,
          last_message_id: input.lastMessageId,
          summary: input.summary,
          source_message_count: input.sourceMessageCount,
          content_hash: input.contentHash,
          generator_model: input.generatorModel,
          generator_version: input.generatorVersion,
          is_noise: input.isNoise,
          relevance: input.relevance,
        },
      ],
      { onConflict: "content_hash" },
    );

  if (error) {
    throw new Error(`Failed to upsert conversation digest: ${error.message}`);
  }
}

export async function conversationDigestExists(
  contentHash: string,
): Promise<boolean> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("conversation_digests")
    .select("id")
    .eq("content_hash", contentHash)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check conversation digest: ${error.message}`);
  }
  return Boolean(data);
}

export async function appendConversationFacts(
  facts: ConversationFactInput[],
): Promise<void> {
  if (facts.length === 0) return;
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("conversation_facts")
    .insert(
      facts.map((fact) => ({
        contact_id: fact.contactId,
        source: fact.source,
        field_key: fact.fieldKey,
        value_text: fact.valueText,
        value_json: fact.valueJson,
        confidence: fact.confidence,
        source_message_ids: fact.sourceMessageIds,
        observed_at: fact.observedAt,
        conflict_group: fact.conflictGroup,
        extractor_model: fact.extractorModel,
        extractor_version: fact.extractorVersion,
      })),
    );

  if (error) {
    throw new Error(`Failed to append conversation facts: ${error.message}`);
  }
}

export async function upsertConversationEmbeddings(
  embeddings: ConversationEmbeddingInput[],
): Promise<void> {
  if (embeddings.length === 0) return;
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("conversation_embeddings")
    .upsert(
      embeddings.map((embedding) => ({
        target_type: embedding.targetType,
        target_id: embedding.targetId,
        embedding_model: embedding.embeddingModel,
        embedding_version: embedding.embeddingVersion,
        content_hash: embedding.contentHash,
        embedding: embedding.embedding,
      })),
      {
        onConflict:
          "target_type,target_id,embedding_model,embedding_version,content_hash",
      },
    );

  if (error) {
    throw new Error(`Failed to upsert conversation embeddings: ${error.message}`);
  }
}

export async function searchConversationEmbeddings(input: {
  embedding: number[];
  contactId?: string | null;
  limit: number;
}): Promise<ConversationEvidenceHit[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc("search_conversation_embeddings", {
    p_query_embedding: input.embedding,
    p_contact_id: input.contactId ?? null,
    p_limit: input.limit,
  });

  if (error) {
    throw new Error(`Failed to search conversation embeddings: ${error.message}`);
  }

  return ((data ?? []) as ConversationSearchRow[]).map((row) => ({
    messageId: row.message_id,
    contactId: row.contact_id,
    body: row.body,
    happenedAt: row.happened_at,
    score: row.similarity ?? row.rank ?? 0,
  }));
}

export async function searchConversationMessagesFts(input: {
  query: string;
  contactId?: string | null;
  limit: number;
}): Promise<ConversationEvidenceHit[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc("search_conversation_messages_fts", {
    p_query: input.query,
    p_contact_id: input.contactId ?? null,
    p_limit: input.limit,
  });

  if (error) {
    throw new Error(`Failed to search conversation messages: ${error.message}`);
  }

  return ((data ?? []) as ConversationSearchRow[]).map((row) => ({
    messageId: row.message_id,
    contactId: row.contact_id,
    body: row.body,
    happenedAt: row.happened_at,
    score: row.rank ?? row.similarity ?? 0,
  }));
}

export async function listConversationMessagesForDigest(input: {
  limit: number;
}): Promise<ConversationDigestMessage[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("id, contact_id, direction, body, happened_at")
    .not("contact_id", "is", null)
    .is("deactivated_at", null)
    .eq("direction", "inbound")
    .order("happened_at", { ascending: true })
    .limit(input.limit);

  if (error) {
    throw new Error(
      `Failed to list conversation messages for digest: ${error.message}`,
    );
  }

  return ((data ?? []) as ConversationDigestMessageRow[])
    .filter((row): row is ConversationDigestMessageRow & { contact_id: string } =>
      Boolean(row.contact_id),
    )
    .map((row) => ({
      id: row.id,
      contactId: row.contact_id,
      direction: row.direction,
      body: row.body,
      happenedAt: row.happened_at,
    }));
}

export async function listUndigestedConversationMessages(input: {
  limit: number;
}): Promise<ConversationDigestMessage[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc(
    "list_undigested_conversation_messages",
    {
      p_limit: input.limit,
    },
  );

  if (error) {
    throw new Error(
      `Failed to list undigested conversation messages: ${error.message}`,
    );
  }

  return ((data ?? []) as ConversationDigestMessageRow[])
    .filter((row): row is ConversationDigestMessageRow & { contact_id: string } =>
      Boolean(row.contact_id),
    )
    .map((row) => ({
      id: row.id,
      contactId: row.contact_id,
      direction: row.direction,
      body: row.body,
      happenedAt: row.happened_at,
    }));
}

export async function listMessagesMissingEmbeddings(input: {
  embeddingModel: string;
  embeddingVersion: string;
  limit: number;
}): Promise<ConversationEmbeddingMessage[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc(
    "list_conversation_messages_missing_embeddings",
    {
      p_embedding_model: input.embeddingModel,
      p_embedding_version: input.embeddingVersion,
      p_limit: input.limit,
    },
  );

  if (error) {
    throw new Error(
      `Failed to list conversation messages missing embeddings: ${error.message}`,
    );
  }

  return ((data ?? []) as ConversationEmbeddingMessageRow[]).map((row) => ({
    id: row.id,
    body: row.body,
  }));
}
