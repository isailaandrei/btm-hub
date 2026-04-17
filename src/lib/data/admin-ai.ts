/**
 * Admin AI Analyst — persistence data layer.
 *
 * Thread/message/citation helpers. Does NOT contain any evidence retrieval,
 * query planning, or LLM call logic — those live in sibling modules.
 *
 * Every write goes through `requireAdmin()` so callers cannot bypass the
 * admin check even if they skip the server action. RLS on the underlying
 * tables is a second line of defense: threads are scoped to
 * `author_id = auth.uid()` at the DB level regardless of what we send.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import type {
  AdminAiCitationDraft,
  AdminAiCitationRow,
  AdminAiMessage,
  AdminAiMessageRole,
  AdminAiMessageStatus,
  AdminAiQueryPlan,
  AdminAiResponse,
  AdminAiScope,
  AdminAiThread,
  AdminAiThreadSummary,
} from "@/types/admin-ai";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const listAdminAiThreadSummaries = cache(
  async function listAdminAiThreadSummaries(input: {
    scope: AdminAiScope;
    contactId?: string;
  }): Promise<AdminAiThreadSummary[]> {
    if (input.scope === "contact" && !input.contactId) {
      throw new Error("contactId is required when scope is 'contact'");
    }

    const supabase = await createClient();
    let query = supabase
      .from("admin_ai_threads")
      .select("id, scope, contact_id, title, created_at, updated_at")
      .eq("scope", input.scope)
      .order("updated_at", { ascending: false });

    if (input.scope === "contact" && input.contactId) {
      query = query.eq("contact_id", input.contactId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list admin AI threads: ${error.message}`);
    }

    const rows = (data ?? []) as Array<{
      id: string;
      scope: AdminAiScope;
      contact_id: string | null;
      title: string;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      contactId: row.contact_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },
);

/**
 * Fetch a thread and its messages + citations in exactly three queries. The
 * result is shaped so the UI can render without N+1 per-message fetches.
 */
export const getAdminAiThreadDetail = cache(
  async function getAdminAiThreadDetail(input: {
    threadId: string;
  }): Promise<{
    thread: AdminAiThread;
    messages: AdminAiMessage[];
    citationsByMessageId: Map<string, AdminAiCitationRow[]>;
  }> {
    const supabase = await createClient();

    const { data: threadData, error: threadError } = await supabase
      .from("admin_ai_threads")
      .select("id, author_id, scope, contact_id, title, created_at, updated_at")
      .eq("id", input.threadId)
      .maybeSingle();

    if (threadError) {
      throw new Error(`Failed to load admin AI thread: ${threadError.message}`);
    }
    if (!threadData) {
      // RLS filters out threads owned by someone else, so "not found" covers
      // both genuinely-missing and not-visible-to-this-admin cases.
      throw new Error(`Admin AI thread not found: ${input.threadId}`);
    }
    const thread = threadData as AdminAiThread;

    const { data: messageData, error: messageError } = await supabase
      .from("admin_ai_messages")
      .select(
        "id, thread_id, role, content, status, query_plan, response_json, model_metadata, created_at",
      )
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true });

    if (messageError) {
      throw new Error(
        `Failed to load admin AI messages: ${messageError.message}`,
      );
    }

    const messages = (messageData ?? []) as AdminAiMessage[];

    const citationsByMessageId = new Map<string, AdminAiCitationRow[]>();
    if (messages.length === 0) {
      // Still need to satisfy the "3 queries" contract in a predictable way
      // for tests and to mirror the shape callers expect. The citations
      // lookup is a no-op when there are no messages.
      return { thread, messages, citationsByMessageId };
    }

    const messageIds = messages.map((m) => m.id);
    const { data: citationData, error: citationError } = await supabase
      .from("admin_ai_message_citations")
      .select(
        "id, message_id, claim_key, source_type, source_id, contact_id, application_id, source_label, snippet, created_at",
      )
      .in("message_id", messageIds);

    if (citationError) {
      throw new Error(
        `Failed to load admin AI citations: ${citationError.message}`,
      );
    }

    for (const row of (citationData ?? []) as AdminAiCitationRow[]) {
      const bucket = citationsByMessageId.get(row.message_id);
      if (bucket) {
        bucket.push(row);
      } else {
        citationsByMessageId.set(row.message_id, [row]);
      }
    }

    return { thread, messages, citationsByMessageId };
  },
);

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createAdminAiThread(input: {
  scope: AdminAiScope;
  contactId?: string;
  title: string;
}): Promise<{ id: string }> {
  if (input.scope === "contact" && !input.contactId) {
    throw new Error("contactId is required when scope is 'contact'");
  }
  const profile = await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("admin_ai_threads")
    .insert({
      author_id: profile.id,
      scope: input.scope,
      contact_id: input.scope === "contact" ? (input.contactId ?? null) : null,
      title: input.title,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create admin AI thread: ${error.message}`);
  }
  const row = data as { id: string } | null;
  if (!row) {
    throw new Error("Failed to create admin AI thread: no row returned");
  }
  return { id: row.id };
}

export async function createAdminAiMessage(input: {
  threadId: string;
  role: AdminAiMessageRole;
  content: string;
  status: AdminAiMessageStatus;
  queryPlan?: AdminAiQueryPlan | null;
  responseJson?: AdminAiResponse | null;
  modelMetadata?: Record<string, unknown> | null;
}): Promise<{ id: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("admin_ai_messages")
    .insert({
      thread_id: input.threadId,
      role: input.role,
      content: input.content,
      status: input.status,
      query_plan: input.queryPlan ?? null,
      response_json: input.responseJson ?? null,
      model_metadata: input.modelMetadata ?? null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create admin AI message: ${error.message}`);
  }
  const row = data as { id: string } | null;
  if (!row) {
    throw new Error("Failed to create admin AI message: no row returned");
  }
  return { id: row.id };
}

export async function createAdminAiCitations(input: {
  messageId: string;
  citations: AdminAiCitationDraft[];
}): Promise<void> {
  if (input.citations.length === 0) return;
  await requireAdmin();
  const supabase = await createClient();

  const rows = input.citations.map((c) => ({
    message_id: input.messageId,
    claim_key: c.claim_key,
    source_type: c.source_type,
    source_id: c.source_id,
    contact_id: c.contact_id,
    application_id: c.application_id,
    source_label: c.source_label,
    snippet: c.snippet,
  }));

  const { error } = await supabase
    .from("admin_ai_message_citations")
    .insert(rows);

  if (error) {
    throw new Error(`Failed to create admin AI citations: ${error.message}`);
  }
}

export async function renameAdminAiThread(input: {
  threadId: string;
  title: string;
}): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  // The BEFORE UPDATE trigger on admin_ai_threads bumps updated_at when the
  // title changes, so we don't set it explicitly here.
  const { error } = await supabase
    .from("admin_ai_threads")
    .update({ title: input.title })
    .eq("id", input.threadId);

  if (error) {
    throw new Error(`Failed to rename admin AI thread: ${error.message}`);
  }
}

export async function deleteAdminAiThread(input: {
  threadId: string;
}): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("admin_ai_threads")
    .delete()
    .eq("id", input.threadId);

  if (error) {
    throw new Error(`Failed to delete admin AI thread: ${error.message}`);
  }
}
