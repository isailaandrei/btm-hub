import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLikesForPost } from "@/lib/data/forum";
import { isUUID } from "@/lib/validation-helpers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("postId") ?? "";

  if (!postId || !isUUID(postId)) {
    return NextResponse.json({ error: "Invalid post ID" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const likes = await getLikesForPost(postId);

  return NextResponse.json(likes);
}
