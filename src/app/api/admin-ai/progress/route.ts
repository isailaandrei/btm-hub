import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateUUID } from "@/lib/validation-helpers";
import { readAdminAiProgress } from "@/lib/admin-ai/progress";
import { getAdminAiMessageStatus } from "@/lib/data/admin-ai";
import type { AdminAiMessageStatus } from "@/types/admin-ai";

// Poll target for the stage line under "AI is thinking" AND (start-and-poll
// ask flow, docs/plans/admin-ai-start-and-poll.md) for the assistant
// placeholder's completion status. This MUST be a route handler, not a
// server action: React serializes server actions per client, so a poll
// action would queue BEHIND the pending/continuation ask and only run after
// it resolves — exactly the bug this replaces. A plain GET bypasses the
// action queue. That constraint applies to completion polling too.
export async function GET(request: Request) {
  await requireAdmin();

  const params = new URL(request.url).searchParams;
  const progressId = params.get("id") ?? "";
  try {
    validateUUID(progressId);
  } catch {
    return NextResponse.json({ error: "Invalid progress id" }, { status: 400 });
  }

  const rawMessageId = params.get("messageId");
  let assistantMessage: { id: string; status: AdminAiMessageStatus } | null = null;
  if (rawMessageId !== null) {
    try {
      validateUUID(rawMessageId);
    } catch {
      return NextResponse.json({ error: "Invalid message id" }, { status: 400 });
    }
    const message = await getAdminAiMessageStatus(rawMessageId);
    assistantMessage = message ? { id: message.id, status: message.status } : null;
  }

  const snapshot = await readAdminAiProgress(progressId);
  return NextResponse.json(
    { snapshot, ...(rawMessageId !== null ? { assistantMessage } : {}) },
    { headers: { "cache-control": "no-store" } },
  );
}
