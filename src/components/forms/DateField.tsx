"use client";

import { type InputHTMLAttributes } from "react";

interface DateFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  label: string;
  name: string;
  error?: string;
  onChange?: (value: string) => void;
}

export function DateField({
  label,
  name,
  error,
  onChange,
  className = "",
  ...props
}: DateFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-brand-light-gray">
        {label}
        {props.required && <span className="ml-1 text-brand-primary">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type="date"
        className={`[color-scheme:dark] rounded-lg border border-brand-secondary bg-brand-near-black px-4 py-3 text-white placeholder-brand-cyan-blue-gray outline-none transition-colors focus:border-brand-primary ${error ? "border-red-400" : ""} ${className}`}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        {...props}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
