import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getOrCreateDirectChatThread } from "@/lib/data/chat-threads";
import { createClient } from "@/lib/supabase/server";
import { createStreamServerClient } from "@/lib/stream/server";
import { toStreamUser } from "@/lib/stream/user";
import { isUUID } from "@/lib/validation-helpers";

// Stream SDK HTTP calls carry a 3s default timeout; this route-level ceiling
// is defense-in-depth so a pathological hang can't hold a Fluid instance to
// the 300s project default.
export const maxDuration = 60;

export const runtime = "nodejs";

const directChannelSchema = z.object({
  recipientId: z.string().refine(isUUID, {
    message: "Invalid recipient ID",
  }),
});

async function loadProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data;
}

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

  const parsed = directChannelSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid recipient" },
      { status: 400 },
    );
  }

  const { recipientId } = parsed.data;
  if (recipientId === user.id) {
    return NextResponse.json(
      { error: "You cannot message yourself." },
      { status: 400 },
    );
  }

  const [senderProfile, recipientProfile] = await Promise.all([
    loadProfile(supabase, user.id),
    loadProfile(supabase, recipientId),
  ]);

  if (!recipientProfile) {
    return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
  }

  if (!senderProfile) {
    return NextResponse.json({ error: "Current profile not found" }, { status: 500 });
  }

  try {
    const thread = await getOrCreateDirectChatThread({
      currentUserId: user.id,
      recipientId,
    });
    const stream = createStreamServerClient();
    const streamUsers = [
      toStreamUser(senderProfile),
      toStreamUser(recipientProfile),
    ];

    await stream.upsertUsers(streamUsers);

    const channel = stream.channel("messaging", thread.provider_channel_id, {
      members: [user.id, recipientId],
      created_by_id: user.id,
    });
    const created = await channel.create();
    const cid = channel.cid ?? created.channel?.cid;

    if (!cid) {
      throw new Error("Stream did not return a channel cid");
    }

    if (cid !== thread.provider_channel_cid) {
      throw new Error("Stream channel cid did not match the app thread mapping");
    }

    return NextResponse.json({ threadId: thread.id, cid });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Stream channel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
