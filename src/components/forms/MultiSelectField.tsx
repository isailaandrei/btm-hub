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
  const otherValue = allowOther
    ? values.find((v) => !canonicalSet.has(v)) ?? ""
    : "";

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
      <div
        className={`grid gap-2 ${gridCols[columns]} ${
          error ? "rounded-lg ring-1 ring-red-400 p-1" : ""
        }`}
      >
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
          className={`mt-1 rounded-lg border bg-card px-4 py-3 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary ${
            otherValue ? "border-primary" : "border-border"
          }`}
        />
      )}
    </div>
  );
}
