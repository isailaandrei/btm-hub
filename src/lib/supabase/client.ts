import { createBrowserClient } from "@supabase/ssr";

// NOTE: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is the current Supabase convention (2025+).
// New projects issue publishable keys (sb_publishable_...) instead of legacy anon keys.
// Both key types work interchangeably with createBrowserClient/createServerClient.
// See: https://supabase.com/docs/guides/api/api-keys

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
