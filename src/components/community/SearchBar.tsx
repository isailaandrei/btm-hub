"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";

export function SearchBar() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get("q") ?? "";
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  function navigate(q: string) {
    startTransition(() => {
      router.replace(q ? `/community?q=${encodeURIComponent(q)}` : "/community");
    });
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => navigate(next.trim()), 300);
  }

  return (
    <div className="relative">
      {isPending ? (
        <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      )}
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Search threads..."
        className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}
