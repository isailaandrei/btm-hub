"use client";

import { useState } from "react";
import { Loader2, Monitor, RefreshCw, Smartphone } from "lucide-react";

type Viewport = "desktop" | "mobile";

const MOBILE_WIDTH = 390;
const DESKTOP_MAX_WIDTH = 760;

interface EmailPreviewProps {
  html: string;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function EmailPreview({
  html,
  isLoading,
  error,
  onRefresh,
}: EmailPreviewProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const isMobile = viewport === "mobile";

  return (
    <div className="flex min-h-[760px] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => setViewport("desktop")}
            aria-pressed={!isMobile}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              !isMobile
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setViewport("mobile")}
            aria-pressed={isMobile}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              isMobile
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            Mobile
          </button>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      <div className="flex flex-1 justify-center overflow-auto rounded-md border border-border bg-[#f3f4f6] p-4">
        {error ? (
          <p className="m-auto max-w-sm text-center text-sm text-destructive">
            {error}
          </p>
        ) : isLoading && !html ? (
          <div className="m-auto flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Rendering preview...
          </div>
        ) : html ? (
          <iframe
            title="Email preview"
            srcDoc={html}
            sandbox=""
            className="h-[720px] w-full rounded-sm bg-white shadow-sm"
            style={{
              maxWidth: isMobile ? MOBILE_WIDTH : DESKTOP_MAX_WIDTH,
            }}
          />
        ) : (
          <p className="m-auto text-sm text-muted-foreground">
            Nothing to preview yet.
          </p>
        )}
      </div>
    </div>
  );
}
