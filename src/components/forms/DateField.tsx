"use client";

import { useRef, type InputHTMLAttributes } from "react";

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
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-muted-foreground">
        {label}
        {props.required && <span className="ml-1 text-primary">*</span>}
      </label>
      <input
        ref={inputRef}
        id={name}
        name={name}
        type="date"
        className={`cursor-pointer [color-scheme:dark] rounded-lg border border-border bg-card px-4 py-3 text-foreground outline-none transition-colors focus:border-primary ${error ? "border-red-400" : ""} ${className}`}
        onClick={() => inputRef.current?.showPicker()}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        {...props}
      />
    </div>
  );
}
