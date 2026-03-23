import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchProfiles } from "@/lib/data/forum";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";

  if (!query.trim()) {
    return NextResponse.json([]);
  }

  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await searchProfiles(query, 10);

  return NextResponse.json(profiles);
}
