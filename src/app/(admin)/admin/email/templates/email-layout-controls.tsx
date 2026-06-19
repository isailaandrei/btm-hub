"use client";

import { useState } from "react";
import {
  clampEmailPadding,
  clampEmailWidth,
  EMAIL_FONTS,
  MAX_EMAIL_PADDING,
  MAX_EMAIL_WIDTH,
  MIN_EMAIL_PADDING,
  MIN_EMAIL_WIDTH,
  type EmailLayout,
} from "@/lib/email/rendering/maily";

/** A number input that holds a free-text draft while focused (so it can be
 *  cleared and retyped without snapping), clamping only on blur. */
function DraftNumberInput({
  label,
  value,
  min,
  max,
  clamp,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  clamp: (value: unknown) => number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const display = focused ? draft : String(value);

  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={2}
        value={display}
        onFocus={() => {
          setFocused(true);
          setDraft(String(value));
        }}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          if (raw === "") return;
          const next = Number(raw);
          if (Number.isFinite(next)) onCommit(Math.min(max, next));
        }}
        onBlur={() => {
          setFocused(false);
          onCommit(clamp(draft));
        }}
        className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
      />
    </label>
  );
}

export function EmailLayoutControls({
  value,
  onChange,
}: {
  value: EmailLayout;
  onChange: (layout: EmailLayout) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        Font
        <select
          value={value.fontKey}
          onChange={(event) =>
            onChange({ ...value, fontKey: event.target.value })
          }
          className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
        >
          {EMAIL_FONTS.map((font) => (
            <option key={font.key} value={font.key}>
              {font.label}
            </option>
          ))}
        </select>
      </label>
      <DraftNumberInput
        label="Width"
        value={value.maxWidth}
        min={MIN_EMAIL_WIDTH}
        max={MAX_EMAIL_WIDTH}
        clamp={clampEmailWidth}
        onCommit={(maxWidth) => onChange({ ...value, maxWidth })}
      />
      <DraftNumberInput
        label="Top pad"
        value={value.paddingTop}
        min={MIN_EMAIL_PADDING}
        max={MAX_EMAIL_PADDING}
        clamp={clampEmailPadding}
        onCommit={(paddingTop) => onChange({ ...value, paddingTop })}
      />
      <DraftNumberInput
        label="Bottom pad"
        value={value.paddingBottom}
        min={MIN_EMAIL_PADDING}
        max={MAX_EMAIL_PADDING}
        clamp={clampEmailPadding}
        onCommit={(paddingBottom) => onChange({ ...value, paddingBottom })}
      />
      <span className="text-xs text-muted-foreground">px</span>
    </div>
  );
}
