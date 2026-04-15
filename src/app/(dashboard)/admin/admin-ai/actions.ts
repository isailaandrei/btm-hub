"use server";

import { revalidatePath } from "next/cache";
import {
  adminAiAskInputSchema,
  adminAiThreadLoadSchema,
  adminAiThreadMutationSchema,
} from "@/lib/admin-ai/schemas";
import { runAdminAiAnalysis } from "@/lib/admin-ai/orchestrator";
import {
  createAdminAiMessage,
  createAdminAiThread,
  deleteAdminAiThread,
  getAdminAiThreadDetail,
  renameAdminAiThread,
} from "@/lib/data/admin-ai";
import type {
  AdminAiCitationRow,
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

type ExistingThreadMetadata = {
  title: string;
  createdAt: string;
};

function buildThreadTitle(question: string): string {
  return question.trim().slice(0, 80) || "New AI thread";
}

function revalidateAdminAiViews(scope: "global" | "contact", contactId?: string) {
  revalidatePath("/admin");
  if (scope === "contact" && contactId) {
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

function buildLocalCitationRows(input: {
  messageId: string;
  createdAt: string;
  citations: Array<{
    claim_key: string;
    source_type: AdminAiCitationRow["source_type"];
    source_id: string;
    contact_id: string;
    application_id: string | null;
    source_label: string;
    snippet: string;
  }>;
}): AdminAiCitationRow[] {
  return input.citations.map((citation, index) => ({
    id: `${input.messageId}-citation-${index}`,
    message_id: input.messageId,
    claim_key: citation.claim_key,
    source_type: citation.source_type,
    source_id: citation.source_id,
    contact_id: citation.contact_id,
    application_id: citation.application_id,
    source_label: citation.source_label,
    snippet: citation.snippet,
    created_at: input.createdAt,
  }));
}

function serializeThreadDetail(detail: Awaited<ReturnType<typeof getAdminAiThreadDetail>>) {
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
      citations: detail.citationsByMessageId.get(message.id) ?? [],
    }) satisfies AdminAiMessageSummary),
  };
}

export async function askAdminAiQuestion(
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

  let threadId = parsed.data.threadId;
  if (!threadId) {
    const created = await createAdminAiThread({
      scope: parsed.data.scope,
      contactId: parsed.data.contactId,
      title: threadTitle,
    });
    threadId = created.id;
  }

  const userMessage = await createAdminAiMessage({
    threadId,
    role: "user",
    content: parsed.data.question,
    status: "complete",
  });

  const thread = serializeThreadSummary({
    id: threadId,
    scope: parsed.data.scope,
    contactId: parsed.data.contactId,
    title:
      prevState.thread?.id === threadId
        ? prevState.thread.title
        : existingThreadMetadata?.title ?? threadTitle,
    createdAt:
      prevState.thread?.id === threadId
        ? prevState.thread.createdAt
        : existingThreadMetadata?.createdAt ?? now,
    updatedAt: now,
  });

  const baseMessages: AdminAiMessageSummary[] = [
    ...(prevState.thread?.id === threadId && prevState.messages
      ? prevState.messages
      : []),
    {
      id: userMessage.id,
      threadId,
      role: "user",
      status: "complete",
      content: parsed.data.question,
      createdAt: now,
      queryPlan: null,
      response: null,
      citations: [],
    },
  ];

  try {
    const analysis = await runAdminAiAnalysis({
      scope: parsed.data.scope,
      threadId,
      question: parsed.data.question,
      contactId: parsed.data.contactId,
    });

    const assistantCreatedAt = new Date().toISOString();
    const assistantMessage: AdminAiMessageSummary = {
      id: analysis.assistantMessageId,
      threadId,
      role: "assistant",
      status: analysis.status,
      content: analysis.response?.summary ?? analysis.error ?? "Admin AI failed.",
      createdAt: assistantCreatedAt,
      queryPlan: analysis.queryPlan,
      response: analysis.response,
      citations: buildLocalCitationRows({
        messageId: analysis.assistantMessageId,
        createdAt: assistantCreatedAt,
        citations: analysis.citations,
      }),
    };

    revalidateAdminAiViews(parsed.data.scope, parsed.data.contactId);

    return {
      errors: null,
      message: analysis.error,
      success: analysis.status === "complete",
      thread,
      messages: [...baseMessages, assistantMessage],
    };
  } catch (error) {
    const assistantMessageId =
      typeof error === "object" &&
      error !== null &&
      "assistantMessageId" in error &&
      typeof error.assistantMessageId === "string"
        ? error.assistantMessageId
        : crypto.randomUUID();

    revalidateAdminAiViews(parsed.data.scope, parsed.data.contactId);

    return {
      errors: null,
      message:
        error instanceof Error
          ? error.message
          : "Admin AI analysis failed.",
      success: false,
      thread,
      messages: [
        ...baseMessages,
        {
          id: assistantMessageId,
          threadId,
          role: "assistant",
          status: "failed",
          content:
            error instanceof Error
              ? error.message
              : "Admin AI analysis failed.",
          createdAt: new Date().toISOString(),
          queryPlan: null,
          response: null,
          citations: [],
        },
      ],
    };
  }
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
