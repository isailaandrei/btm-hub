"use client";

import { useState } from "react";
import {
  clampCornerRadius,
  clampEmailPadding,
  clampEmailWidth,
  EMAIL_FONTS,
  MAX_CORNER_RADIUS,
  MAX_EMAIL_PADDING,
  MAX_EMAIL_WIDTH,
  MIN_CORNER_RADIUS,
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

/** A compact color swatch backed by the native color picker. */
function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <span className="relative inline-flex size-6 shrink-0 overflow-hidden rounded-md border border-border">
        <input
          type="color"
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-[-25%] h-[150%] w-[150%] cursor-pointer border-0 bg-transparent p-0"
        />
      </span>
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
      <DraftNumberInput
        label="Corners"
        value={value.cornerRadius}
        min={MIN_CORNER_RADIUS}
        max={MAX_CORNER_RADIUS}
        clamp={clampCornerRadius}
        onCommit={(cornerRadius) => onChange({ ...value, cornerRadius })}
      />
      <span className="text-xs text-muted-foreground">px</span>
      <ColorInput
        label="Card"
        value={value.containerBackground}
        onChange={(containerBackground) =>
          onChange({ ...value, containerBackground })
        }
      />
      <ColorInput
        label="Backdrop"
        value={value.bodyBackground}
        onChange={(bodyBackground) => onChange({ ...value, bodyBackground })}
      />
    </div>
  );
}
