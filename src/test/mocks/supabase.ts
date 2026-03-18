import { vi } from "vitest";

/**
 * Creates a mock Supabase client with chainable query builder.
 * Each test can override return values via the `mockResult` helpers.
 */
export function createMockSupabaseClient() {
  const result = { data: null as unknown, error: null as unknown, count: null as number | null };

  const storageResult = { data: null as unknown, error: null as unknown };

  // Chainable query builder — every method returns `query` so calls like
  // supabase.from("x").select("*").eq("id", 1).single() work in tests.
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    "select", "insert", "update", "delete", "upsert",
    "eq", "neq", "gt", "lt", "gte", "lte",
    "like", "ilike", "is", "in", "contains",
    "or", "and", "not", "filter",
    "order", "limit", "range", "single", "maybeSingle",
  ]) {
    query[method] = vi.fn().mockReturnValue(query);
  }

  // Terminal methods resolve to the result
  query.then = vi.fn((resolve) => resolve(result));

  // Make the query builder thenable so `await supabase.from(...).select(...)` works
  const from = vi.fn().mockReturnValue(query);

  // RPC
  const rpc = vi.fn().mockResolvedValue(result);

  // Auth
  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };

  // Storage
  const storageBucket = {
    upload: vi.fn().mockResolvedValue(storageResult),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "http://test/avatar.jpg" } }),
  };
  const storage = {
    from: vi.fn().mockReturnValue(storageBucket),
  };

  const client = { from, rpc, auth, storage };

  return {
    client,
    query,
    result,
    auth,
    storage: storageBucket,
    storageResult,
    /** Set the data/error that queries will resolve with */
    mockQueryResult(data: unknown, error: unknown = null, count: number | null = null) {
      result.data = data;
      result.error = error;
      result.count = count;
    },
  };
}
