"use client";

interface RatingFieldProps {
  label: string;
  name: string;
  value?: number;
  onChange: (value: number) => void;
  error?: string;
}

export function RatingField({
  label,
  name,
  value,
  onChange,
  error,
}: RatingFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      <input type="hidden" name={name} value={value ?? ""} />
      <div className={`flex gap-2 ${error ? "rounded-lg ring-1 ring-red-400 p-1" : ""}`}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex h-9 w-9 items-center justify-center rounded-md border text-sm font-medium transition-colors ${
              value === n
                ? "border-primary bg-primary text-white"
                : "border-border bg-card text-muted-foreground hover:border-border"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
