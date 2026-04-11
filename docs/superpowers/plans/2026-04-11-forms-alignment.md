# Forms Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the academy form-code (`src/lib/academy/forms/*`) with the 4 live Google Forms authored by partner A, add native "Other" free-text support, consolidate every enum into `common/options.ts`, rewire the admin Contacts filter UI to use curated options with an "Other" bucket, and ship a Supabase migration that normalizes known typos and the `referral_source` split-array bug.

**Architecture:** Read-time normalization is deferred to Phase B (separate plan). This plan only touches **form definitions**, **schema builder**, **form renderer components**, the **admin field registry + filter popover + contacts panel**, and a **single additive SQL migration**. Storage shape for existing JSONB rows is preserved except for the specific fields listed in the migration.

**Tech Stack:** Next.js 16 · React 19 · TypeScript · Zod 4 · Supabase Postgres · Vitest · Tailwind CSS 4 · shadcn/ui

**Spec:** [`docs/superpowers/specs/2026-04-11-forms-alignment-design.md`](../specs/2026-04-11-forms-alignment-design.md)
**Companion diff:** [`docs/superpowers/specs/2026-04-11-forms-alignment-diff.md`](../specs/2026-04-11-forms-alignment-diff.md)

---

## Phase 1 — `allowOther` infrastructure

### Task 1: Add `allowOther` to types & schema-builder

**Files:**
- Modify: `src/lib/academy/forms/types.ts` (lines 24-35)
- Modify: `src/lib/academy/forms/schema-builder.ts` (lines 55-63)
- Test: `src/lib/academy/forms/schema-builder.test.ts` (append new cases)

- [ ] **Step 1: Add failing tests for `allowOther` behavior**

Append to `src/lib/academy/forms/schema-builder.test.ts` inside the `describe("buildStepSchema", ...)` block, after the existing multiselect tests:

```typescript
  // --- allowOther ---

  it("select with allowOther accepts a value outside the option list", () => {
    const fields: SelectFieldDef[] = [
      { type: "select", name: "source", label: "Source", options: ["A", "B"], allowOther: true },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ source: "A" }).success).toBe(true);
    expect(schema.safeParse({ source: "Custom text" }).success).toBe(true);
  });

  it("select with allowOther still rejects an empty string when required", () => {
    const fields: SelectFieldDef[] = [
      { type: "select", name: "source", label: "Source", options: ["A"], allowOther: true },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ source: "" }).success).toBe(false);
  });

  it("multiselect with allowOther accepts an array containing non-canonical strings", () => {
    const fields: MultiSelectFieldDef[] = [
      { type: "multiselect", name: "tags", label: "Tags", options: ["X", "Y"], allowOther: true },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ tags: ["X", "free text"] }).success).toBe(true);
    expect(schema.safeParse({ tags: ["only free text"] }).success).toBe(true);
  });

  it("multiselect with allowOther still requires at least one value when required", () => {
    const fields: MultiSelectFieldDef[] = [
      { type: "multiselect", name: "tags", label: "Tags", options: ["X"], allowOther: true },
    ];
    const schema = buildStepSchema(fields);

    expect(schema.safeParse({ tags: [] }).success).toBe(false);
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm run test:unit -- schema-builder
```

Expected: 4 new tests fail with errors about `allowOther` not being a valid property on `SelectFieldDef`/`MultiSelectFieldDef`, or (if TS lets it through) Zod enum rejecting values outside the literal union.

- [ ] **Step 3: Extend the field definition types**

Replace lines 24-35 of `src/lib/academy/forms/types.ts`:

```typescript
export interface SelectFieldDef extends FieldBase {
  type: "select";
  options: readonly string[];
  columns?: 1 | 2 | 3;
  /**
   * When true, the field accepts any string (not just one of the `options`).
   * The renderer shows an "Other (please specify)" text input below the option
   * buttons; the user's custom text is stored directly in `answers[name]`, so
   * new submissions match the existing Google Forms storage shape where Other
   * text lives alongside canonical option strings.
   */
  allowOther?: boolean;
}

export interface MultiSelectFieldDef extends FieldBase {
  type: "multiselect";
  options: readonly string[];
  columns?: 1 | 2 | 3;
  /**
   * When true, the field accepts an array with any string values (not limited
   * to `options`). An extra text input appears under the option grid; its
   * contents (when non-empty) are appended to the stored array at submit time.
   */
  allowOther?: boolean;
}
```

- [ ] **Step 4: Update `buildFieldSchema` to relax validation when `allowOther` is set**

Replace lines 55-63 of `src/lib/academy/forms/schema-builder.ts`:

```typescript
    case "select": {
      if (field.allowOther) {
        return field.required !== false
          ? z.string().min(1, `${field.label} is required`)
          : z.string().optional();
      }
      return z.enum(field.options as [string, ...string[]]);
    }

    case "multiselect": {
      const elementSchema = field.allowOther
        ? z.string()
        : z.enum(field.options as [string, ...string[]]);
      const arr = z.array(elementSchema);
      return field.required !== false
        ? arr.check(z.minLength(1, "Select at least one option"))
        : arr;
    }
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
npm run test:unit -- schema-builder
```

Expected: all 4 new tests pass, plus the pre-existing schema-builder tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/academy/forms/types.ts src/lib/academy/forms/schema-builder.ts src/lib/academy/forms/schema-builder.test.ts
git commit -m "feat(forms): add allowOther flag to select and multiselect field defs

Allows future form definitions to accept free-text values outside the
enum list, matching how Google Forms' 'Other' option currently stores
user-provided text directly in applications.answers. Schema builder
relaxes z.enum to z.string()/z.array(z.string()) when allowOther=true.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Render the Other text input in `SelectField`

**Files:**
- Modify: `src/components/forms/SelectField.tsx` (whole file)

- [ ] **Step 1: Extend `SelectField` props and rendering**

Replace the entire contents of `src/components/forms/SelectField.tsx`:

```tsx
"use client";

interface SelectFieldProps {
  label: string;
  name: string;
  options: readonly string[];
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  columns?: 1 | 2 | 3;
  required?: boolean;
  allowOther?: boolean;
}

const gridCols: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
};

export function SelectField({
  label,
  name,
  options,
  value,
  onChange,
  error,
  columns = 1,
  required,
  allowOther,
}: SelectFieldProps) {
  const isOtherValue = allowOther && value != null && value !== "" && !options.includes(value);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
      </label>
      <input type="hidden" name={name} value={value ?? ""} />
      <div className={`grid gap-2 ${gridCols[columns]} ${error ? "rounded-lg ring-1 ring-red-400 p-1" : ""}`}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
              value === option
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-border"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      {allowOther && (
        <input
          type="text"
          placeholder="Other (please specify)"
          value={isOtherValue ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={`mt-1 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary ${
            isOtherValue ? "border-primary" : ""
          }`}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the unit test suite to confirm nothing regressed**

```bash
npm run test:unit
```

Expected: all previously-passing tests still pass. No new tests added in this task (component tests are skipped per the design spec — this is verified manually in Task 13's dev-server smoke check).

- [ ] **Step 3: Commit**

```bash
git add src/components/forms/SelectField.tsx
git commit -m "feat(forms): SelectField renders Other text input when allowOther=true

Typing in the Other input replaces the currently-selected canonical
option with the user's free text; clicking a canonical option clears the
Other input. Storage shape: answers[name] holds either a canonical
option string or the user's custom text — mutually exclusive for select.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Render the Other text input in `MultiSelectField`

**Files:**
- Modify: `src/components/forms/MultiSelectField.tsx` (whole file)

- [ ] **Step 1: Replace the file contents**

```tsx
"use client";

interface MultiSelectFieldProps {
  label: string;
  name: string;
  options: readonly string[];
  values?: string[];
  onChange: (values: string[]) => void;
  error?: string;
  columns?: 1 | 2 | 3;
  required?: boolean;
  allowOther?: boolean;
}

const gridCols: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
};

export function MultiSelectField({
  label,
  name,
  options,
  values = [],
  onChange,
  error,
  columns = 2,
  required,
  allowOther,
}: MultiSelectFieldProps) {
  const canonicalSet = new Set(options);
  const otherValue = allowOther ? values.find((v) => !canonicalSet.has(v)) ?? "" : "";

  function toggle(option: string) {
    if (values.includes(option)) {
      onChange(values.filter((v) => v !== option));
    } else {
      onChange([...values, option]);
    }
  }

  function setOther(next: string) {
    const canonical = values.filter((v) => canonicalSet.has(v));
    onChange(next.trim() === "" ? canonical : [...canonical, next]);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
      </label>
      <input type="hidden" name={name} value={JSON.stringify(values)} />
      <div className={`grid gap-2 ${gridCols[columns]} ${error ? "rounded-lg ring-1 ring-red-400 p-1" : ""}`}>
        {options.map((option) => {
          const selected = values.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-border"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      {allowOther && (
        <input
          type="text"
          placeholder="Other (please specify)"
          value={otherValue}
          onChange={(e) => setOther(e.target.value)}
          className={`mt-1 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary ${
            otherValue ? "border-primary" : ""
          }`}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the unit test suite**

```bash
npm run test:unit
```

Expected: all tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/forms/MultiSelectField.tsx
git commit -m "feat(forms): MultiSelectField renders Other text input when allowOther=true

The Other text is stored as an additional element in the same array, so
new submissions produce the same JSONB shape as existing Google Forms
data (free text sits alongside canonical option strings in the array).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire `allowOther` through `DynamicFormRenderer`

**Files:**
- Modify: `src/components/forms/DynamicFormRenderer.tsx` (lines 96-122)

- [ ] **Step 1: Pass the flag from field definitions to child components**

Replace lines 96-122 of `src/components/forms/DynamicFormRenderer.tsx`:

```tsx
    case "select":
      return (
        <SelectField
          label={field.label}
          name={field.name}
          options={field.options}
          required={field.required}
          allowOther={field.allowOther}
          value={answers[field.name] as string}
          onChange={(v) => onChange(field.name, v)}
          columns={field.columns ?? inferColumns(field.options.length)}
          error={error}
        />
      );

    case "multiselect":
      return (
        <MultiSelectField
          label={field.label}
          name={field.name}
          options={field.options}
          required={field.required}
          allowOther={field.allowOther}
          values={answers[field.name] as string[]}
          onChange={(v) => onChange(field.name, v)}
          columns={field.columns ?? inferColumns(field.options.length)}
          error={error}
        />
      );
```

- [ ] **Step 2: Verify the change typechecks and tests still pass**

```bash
npm run lint && npm run test:unit
```

Expected: both green.

- [ ] **Step 3: Commit**

```bash
git add src/components/forms/DynamicFormRenderer.tsx
git commit -m "feat(forms): pass allowOther from field def through DynamicFormRenderer

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

