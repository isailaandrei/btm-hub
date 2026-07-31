"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdminAiEvidenceEnabled } from "@/lib/admin-ai/feature-flags";
import {
  adminAiAskInputSchema,
  adminAiThreadLoadSchema,
  adminAiThreadMutationSchema,
} from "@/lib/admin-ai/schemas";
import { requireAdmin } from "@/lib/auth/require-admin";
import { adminAiDebugLog } from "@/lib/admin-ai/debug";
import { getAdminAiProviderAvailability } from "@/lib/admin-ai/provider";
import {
  createAdminAiProgressReporter,
  type AdminAiProgressReporter,
} from "@/lib/admin-ai/progress";
import { validateUUID } from "@/lib/validation-helpers";
import { runAdminAiAnalysis } from "@/lib/admin-ai/orchestrator";
import {
  createAdminAiMessage,
  createAdminAiThread,
  deleteAdminAiThread,
  getAdminAiThreadDetail,
  listAdminAiThreadSummaries,
  renameAdminAiThread,
  updateAdminAiMessage,
} from "@/lib/data/admin-ai";
import type {
  AdminAiMessageSummary,
  AdminAiThreadSummary,
} from "@/types/admin-ai";

export type AdminAiAskFormState = {
  errors: Record<string, string[]> | null;
  message: string | null;
  success: boolean;
  thread: AdminAiThreadSummary | null;
  messages: AdminAiMessageSummary[] | null;
};

export type AdminAiPanelData = {
  initialThreads: AdminAiThreadSummary[];
  providerAvailability: ReturnType<typeof getAdminAiProviderAvailability>;
};

type ExistingThreadMetadata = {
  title: string;
  createdAt: string;
};

function buildThreadTitle(question: string): string {
  return question.trim().slice(0, 80) || "New AI thread";
}

function revalidateAdminAiViews(scope: "global" | "contact", contactId?: string) {
  if (scope === "global") {
    return;
  }

  if (contactId) {
    revalidatePath(`/admin/contacts/${contactId}`);
  }
}

function getExistingThreadMetadata(formData: FormData): ExistingThreadMetadata | null {
  const title = formData.get("threadTitle");
  const createdAt = formData.get("threadCreatedAt");

  if (typeof title !== "string" || typeof createdAt !== "string") {
    return null;
  }

  const normalizedTitle = title.trim();
  const normalizedCreatedAt = createdAt.trim();

  if (!normalizedTitle || !normalizedCreatedAt) {
    return null;
  }

  return {
    title: normalizedTitle.slice(0, 200),
    createdAt: normalizedCreatedAt,
  };
}

function serializeThreadSummary(input: {
  id: string;
  scope: "global" | "contact";
  contactId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}): AdminAiThreadSummary {
  return {
    id: input.id,
    scope: input.scope,
    contactId: input.contactId ?? null,
    title: input.title,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function serializeThreadDetail(detail: Awaited<ReturnType<typeof getAdminAiThreadDetail>>) {
  const includeEvidence = isAdminAiEvidenceEnabled();
  return {
    thread: {
      id: detail.thread.id,
      scope: detail.thread.scope,
      contactId: detail.thread.contact_id,
      title: detail.thread.title,
      createdAt: detail.thread.created_at,
      updatedAt: detail.thread.updated_at,
    } satisfies AdminAiThreadSummary,
    messages: detail.messages.map((message) => ({
      id: message.id,
      threadId: message.thread_id,
      role: message.role,
      status: message.status,
      content: message.content,
      createdAt: message.created_at,
      queryPlan: message.query_plan,
      response: message.response_json,
      citations: includeEvidence
        ? detail.citationsByMessageId.get(message.id) ?? []
        : [],
    }) satisfies AdminAiMessageSummary),
  };
}

/**
 * Starts an admin AI ask and returns almost immediately: the thread/user
 * message/placeholder assistant message are persisted synchronously, then the
 * actual analysis runs AFTER the response is sent (`after()`, from
 * "next/server") so this Server Action never holds the connection open for
 * the 7-170s the full pipeline can take. Hostinger's front proxy kills
 * responses held past ~60s, which the client would see as a hard error even
 * though Node kept working and persisted the answer anyway (live incident
 * Jul 30 2026) — returning early and polling for completion sidesteps that
 * proxy entirely. The client polls GET /api/admin-ai/progress?...&messageId=
 * for the placeholder's status and loads the finished thread once it flips.
 */
export async function startAdminAiQuestion(
  prevState: AdminAiAskFormState,
  formData: FormData,
): Promise<AdminAiAskFormState> {
  const parsed = adminAiAskInputSchema.safeParse({
    scope: formData.get("scope") ?? "",
    question: formData.get("question") ?? "",
    threadId: formData.get("threadId") || undefined,
    contactId: formData.get("contactId") || undefined,
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: null,
      success: false,
      thread: prevState.thread,
      messages: prevState.messages,
    };
  }

  const now = new Date().toISOString();
  const threadTitle = buildThreadTitle(parsed.data.question);
  const existingThreadMetadata = getExistingThreadMetadata(formData);
  const providerAvailability = getAdminAiProviderAvailability();
  adminAiDebugLog("ask-action", {
    scope: parsed.data.scope,
    contactId: parsed.data.contactId ?? null,
    hasThreadId: Boolean(parsed.data.threadId),
    questionChars: parsed.data.question.length,
  });

  if (!providerAvailability.isConfigured) {
    return {
      errors: null,
      message:
        providerAvailability.unavailableReason ?? "Admin AI is not configured yet.",
      success: false,
      thread: prevState.thread,
      messages: prevState.messages,
    };
  }

  let threadId = parsed.data.threadId;
  if (!threadId) {
    const created = await createAdminAiThread({
      scope: parsed.data.scope,
      contactId: parsed.data.contactId,
      title: threadTitle,
    });
    threadId = created.id;
  }
  const resolvedThreadId = threadId;

  const userMessage = await createAdminAiMessage({
    threadId: resolvedThreadId,
    role: "user",
    content: parsed.data.question,
    status: "complete",
  });

  // Placeholder assistant row: inserted "running", then UPDATED in place by
  // the continuation below (success or failure) so the client can poll one
  // stable message id rather than waiting for a new row to appear.
  const placeholder = await createAdminAiMessage({
    threadId: resolvedThreadId,
    role: "assistant",
    content: "",
    status: "running",
  });

  const thread = serializeThreadSummary({
    id: resolvedThreadId,
    scope: parsed.data.scope,
    contactId: parsed.data.contactId,
    title:
      prevState.thread?.id === resolvedThreadId
        ? prevState.thread.title
        : existingThreadMetadata?.title ?? threadTitle,
    createdAt:
      prevState.thread?.id === resolvedThreadId
        ? prevState.thread.createdAt
        : existingThreadMetadata?.createdAt ?? now,
    updatedAt: now,
  });

  const placeholderMessage: AdminAiMessageSummary = {
    id: placeholder.id,
    threadId: resolvedThreadId,
    role: "assistant",
    status: "running",
    content: "",
    createdAt: new Date().toISOString(),
    queryPlan: null,
    response: null,
    citations: [],
  };

  const baseMessages: AdminAiMessageSummary[] = [
    ...(prevState.thread?.id === resolvedThreadId && prevState.messages
      ? prevState.messages
      : []),
    {
      id: userMessage.id,
      threadId: resolvedThreadId,
      role: "user",
      status: "complete",
      content: parsed.data.question,
      createdAt: now,
      queryPlan: null,
      response: null,
      citations: [],
    },
  ];

  // Stage progress (global answers only): the client passes a self-generated
  // UUID and polls GET /api/admin-ai/progress while the continuation below
  // runs. Best-effort by contract — an invalid id degrades to no progress,
  // never to a failure.
  let progressReporter: AdminAiProgressReporter | null = null;
  const rawProgressId = formData.get("progressId");
  if (typeof rawProgressId === "string" && rawProgressId && parsed.data.scope === "global") {
    try {
      validateUUID(rawProgressId);
      progressReporter = createAdminAiProgressReporter(rawProgressId);
    } catch {
      console.warn("[admin-ai] ignoring malformed progressId");
    }
  }

  const scope = parsed.data.scope;
  const question = parsed.data.question;
  const contactId = parsed.data.contactId;
  const placeholderId = placeholder.id;

  after(async () => {
    try {
      const analysis = await runAdminAiAnalysis({
        scope,
        threadId: resolvedThreadId,
        question,
        contactId,
        assistantMessageId: placeholderId,
        onProgress: progressReporter?.report,
      });
      adminAiDebugLog("ask-continuation-done", {
        threadId: resolvedThreadId,
        status: analysis.status,
      });
    } catch (error) {
      // Last-resort failure write so the placeholder can never stay
      // "running" after a caught error. persistSynthesisFailure (inside
      // runAdminAiAnalysis) already updates it for pipeline errors; this
      // covers everything else (e.g. a throw before persistence runs at all).
      console.error("[admin-ai] ask continuation failed", error);
      adminAiDebugLog("ask-action-failed", {
        scope,
        assistantMessageId: placeholderId,
        error: error instanceof Error ? error.message : "Admin AI analysis failed.",
      });
      try {
        await updateAdminAiMessage({
          messageId: placeholderId,
          status: "failed",
          content:
            error instanceof Error ? error.message : "Admin AI analysis failed.",
        });
      } catch (persistError) {
        console.error("[admin-ai] failed to mark placeholder failed", persistError);
      }
    } finally {
      revalidateAdminAiViews(scope, contactId);
      if (progressReporter) void progressReporter.clear();
    }
  });

  return {
    errors: null,
    message: null,
    success: true,
    thread,
    messages: [...baseMessages, placeholderMessage],
  };
}

// NOTE: progress polling deliberately has NO server action — React serializes
// server actions per client, so a poll action would queue behind the pending
// ask/continuation and never run until it resolves. The client polls
// GET /api/admin-ai/progress for both the stage snapshot and (via
// `&messageId=`) the placeholder's completion status.

export async function loadGlobalAdminAiPanelData(): Promise<AdminAiPanelData> {
  await requireAdmin();
  const [initialThreads, providerAvailability] = await Promise.all([
    listAdminAiThreadSummaries({ scope: "global" }),
    Promise.resolve(getAdminAiProviderAvailability()),
  ]);

  return { initialThreads, providerAvailability };
}

export async function loadAdminAiThread(threadId: string) {
  const parsed = adminAiThreadLoadSchema.safeParse({ threadId });
  if (!parsed.success) {
    throw new Error("Invalid admin AI thread.");
  }

  const detail = await getAdminAiThreadDetail({ threadId: parsed.data.threadId });
  return serializeThreadDetail(detail);
}

export async function renameAdminAiThreadAction(input: {
  threadId: string;
  title: string;
  scope: "global" | "contact";
  contactId?: string | null;
}) {
  const parsed = adminAiThreadMutationSchema.safeParse({
    threadId: input.threadId,
    title: input.title,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid admin AI thread title.");
  }

  await renameAdminAiThread({
    threadId: parsed.data.threadId,
    title: parsed.data.title!,
  });
  revalidateAdminAiViews(input.scope, input.contactId ?? undefined);
}

export async function deleteAdminAiThreadAction(input: {
  threadId: string;
  scope: "global" | "contact";
  contactId?: string | null;
}) {
  const parsed = adminAiThreadLoadSchema.safeParse({ threadId: input.threadId });
  if (!parsed.success) {
    throw new Error("Invalid admin AI thread.");
  }

  await deleteAdminAiThread({ threadId: parsed.data.threadId });
  revalidateAdminAiViews(input.scope, input.contactId ?? undefined);
}
