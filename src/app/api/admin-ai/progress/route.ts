import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { validateUUID } from "@/lib/validation-helpers";
import { readAdminAiProgress } from "@/lib/admin-ai/progress";

// Poll target for the stage line under "AI is thinking". This MUST be a route
// handler, not a server action: React serializes server actions per client,
// so a poll action would queue BEHIND the pending ask action and only run
// after the answer resolves — exactly the bug this replaces. A plain GET
// bypasses the action queue.
export async function GET(request: Request) {
  await requireAdmin();

  const progressId = new URL(request.url).searchParams.get("id") ?? "";
  try {
    validateUUID(progressId);
  } catch {
    return NextResponse.json({ error: "Invalid progress id" }, { status: 400 });
  }

  const snapshot = await readAdminAiProgress(progressId);
  return NextResponse.json(
    { snapshot },
    { headers: { "cache-control": "no-store" } },
  );
}
