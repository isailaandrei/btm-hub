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
  const isOtherValue =
    allowOther && value != null && value !== "" && !options.includes(value);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
      </label>
      <input type="hidden" name={name} value={value ?? ""} />
      <div
        className={`grid gap-2 ${gridCols[columns]} ${
          error ? "rounded-lg ring-1 ring-red-400 p-1" : ""
        }`}
      >
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
          className={`mt-1 rounded-lg border bg-card px-4 py-3 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary ${
            isOtherValue ? "border-primary" : "border-border"
          }`}
        />
      )}
    </div>
  );
}
