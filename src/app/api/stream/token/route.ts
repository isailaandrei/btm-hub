import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStreamChatConfig } from "@/lib/stream/env";
import { createStreamServerClient } from "@/lib/stream/server";
import { toStreamUser } from "@/lib/stream/user";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { apiKey, tokenTtlSeconds } = getStreamChatConfig();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error(profileError?.message ?? "Profile not found");
    }

    const streamUser = toStreamUser(profile);
    const stream = createStreamServerClient();

    await stream.upsertUsers([streamUser]);
    const expiresAt = Math.floor(Date.now() / 1000) + tokenTtlSeconds;
    const token = stream.createToken(streamUser.id, expiresAt);

    return NextResponse.json({
      apiKey,
      token,
      expiresAt,
      user: streamUser,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stream token failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
