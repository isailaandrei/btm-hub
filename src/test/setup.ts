// Global test setup for Vitest

// Provide dummy env vars that server-side code reads at import time
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test-anon-key";
process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ??= "test-project";
process.env.NEXT_PUBLIC_SANITY_DATASET ??= "test";
process.env.SANITY_API_READ_TOKEN ??= "test-token";

// Node ships an experimental `localStorage` global that is undefined unless
// the process runs with --localstorage-file, and it shadows jsdom's Storage
// in the vitest environment (Node's in-memory `sessionStorage` works fine).
// Back it with an in-memory Storage so client cache code is testable.
if (globalThis.localStorage === undefined) {
  const store = new Map<string, string>();
  const memoryLocalStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: memoryLocalStorage,
    configurable: true,
    writable: true,
  });
}
