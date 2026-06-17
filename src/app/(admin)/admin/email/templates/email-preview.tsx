"use client";

import { useState } from "react";
import { Loader2, Monitor, RefreshCw, Smartphone } from "lucide-react";

type Viewport = "desktop" | "mobile";

// Common device widths so a too-narrow preview can be widened to a real phone.
const MOBILE_WIDTH_PRESETS = [
  { label: "Small (320)", value: 320 },
  { label: "iPhone (390)", value: 390 },
  { label: "Large (430)", value: 430 },
  { label: "Tablet (600)", value: 600 },
];
const DEFAULT_MOBILE_WIDTH = 390;
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
  const [mobileWidth, setMobileWidth] = useState<number>(DEFAULT_MOBILE_WIDTH);
  const isMobile = viewport === "mobile";

  return (
    <div className="flex min-h-[760px] flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Final rendered email with sample variable values. Use this to check how
        variables fill in and how it looks at different device sizes — the Design
        tab is for editing.
      </p>
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
        {isMobile && (
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            Device width
            <select
              value={mobileWidth}
              onChange={(event) => setMobileWidth(Number(event.target.value))}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              {MOBILE_WIDTH_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        )}
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
              maxWidth: isMobile ? mobileWidth : DESKTOP_MAX_WIDTH,
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
