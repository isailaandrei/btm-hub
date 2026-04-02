"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

export function SearchBar() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q") ?? "";

  function handleClear() {
    router.push("/community");
  }

  return (
    <form
      action="/community"
      method="GET"
      className="relative"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        name="q"
        defaultValue={query}
        placeholder="Search threads..."
        className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {query && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
