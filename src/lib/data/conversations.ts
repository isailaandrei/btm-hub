import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ConversationDirection,
  ConversationProvider,
  ConversationSource,
} from "@/lib/conversations/ingestion/adapter";

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
  body: string;
  happenedAt: string;
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
  body: string;
  happened_at: string;
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
    .single();

  if (error) {
    throw new Error(`Failed to upsert conversation message: ${error.message}`);
  }
  const row = data as MessageRow | null;
  if (!row) throw new Error("Failed to upsert conversation message: no row returned");
  return { id: row.id, contactId: row.contact_id };
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
    .select("id, contact_id, body, happened_at")
    .not("contact_id", "is", null)
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
      body: row.body,
      happenedAt: row.happened_at,
    }));
}
