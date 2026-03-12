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
}: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-brand-light-gray">
        {label}
        {required && <span className="ml-1 text-brand-primary">*</span>}
      </label>
      <input type="hidden" name={name} value={value ?? ""} />
      <div className={`grid gap-2 ${gridCols[columns]}`}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
              value === option
                ? "border-brand-primary bg-brand-primary/10 text-white"
                : "border-brand-secondary bg-brand-near-black text-brand-light-gray hover:border-brand-light-gray"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
