"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "./MarkdownContent";

interface MarkdownEditorProps {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  required?: boolean;
}

export function MarkdownEditor({
  name,
  defaultValue = "",
  placeholder,
  maxLength,
  rows = 8,
  required,
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setTab("write")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            tab === "write"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setTab("preview")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            tab === "preview"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Preview
        </button>
      </div>

      {tab === "write" ? (
        <textarea
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={rows}
          required={required}
          className="w-full resize-y bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      ) : (
        <div className="min-h-[8rem] px-4 py-3">
          {value.trim() ? (
            <MarkdownContent content={value} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview</p>
          )}
        </div>
      )}
    </div>
  );
}
