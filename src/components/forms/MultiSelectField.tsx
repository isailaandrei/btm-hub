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
}: MultiSelectFieldProps) {
  function toggle(option: string) {
    if (values.includes(option)) {
      onChange(values.filter((v) => v !== option));
    } else {
      onChange([...values, option]);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-brand-light-gray">
        {label}
        {required && <span className="ml-1 text-brand-primary">*</span>}
      </label>
      <input type="hidden" name={name} value={JSON.stringify(values)} />
      <div className={`grid gap-2 ${gridCols[columns]}`}>
        {options.map((option) => {
          const selected = values.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                selected
                  ? "border-brand-primary bg-brand-primary/10 text-white"
                  : "border-brand-secondary bg-brand-near-black text-brand-light-gray hover:border-brand-light-gray"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
