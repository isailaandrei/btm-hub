import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { markStreamThreadNotificationsRead } from "@/lib/data/stream-notifications";
import { createClient } from "@/lib/supabase/server";
import { isUUID } from "@/lib/validation-helpers";

export const runtime = "nodejs";

const markReadSchema = z.object({
  threadId: z.string().refine(isUUID, {
    message: "Valid thread ID is required",
  }),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = markReadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid thread ID" },
      { status: 400 },
    );
  }

  await markStreamThreadNotificationsRead({
    recipientId: user.id,
    threadId: parsed.data.threadId,
  });

  return NextResponse.json({ ok: true });
}
