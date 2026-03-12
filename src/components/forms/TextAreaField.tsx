"use client";

import { type TextareaHTMLAttributes } from "react";

interface TextAreaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  label: string;
  name: string;
  error?: string;
  onChange?: (value: string) => void;
}

export function TextAreaField({
  label,
  name,
  error,
  onChange,
  className = "",
  ...props
}: TextAreaFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-brand-light-gray">
        {label}
        {props.required && <span className="ml-1 text-brand-primary">*</span>}
      </label>
      <textarea
        id={name}
        name={name}
        rows={4}
        className={`resize-none rounded-lg border border-brand-secondary bg-brand-near-black px-4 py-3 text-white placeholder-brand-cyan-blue-gray outline-none transition-colors focus:border-brand-primary ${error ? "border-red-400" : ""} ${className}`}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        {...props}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
