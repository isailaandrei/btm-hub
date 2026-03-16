"use client";

interface TextFieldProps {
  label: string;
  name: string;
  error?: string;
  multiline?: boolean;
  type?: string;
  required?: boolean;
  placeholder?: string;
  value?: string | undefined;
  className?: string;
  onChange?: (value: string) => void;
}

export function TextField({
  label,
  name,
  error,
  multiline,
  onChange,
  className = "",
  ...props
}: TextFieldProps) {
  const sharedClassName = `rounded-lg border border-border bg-card px-4 py-3 text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary ${error ? "border-red-400" : ""} ${className}`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-muted-foreground">
        {label}
        {props.required && <span className="ml-1 text-primary">*</span>}
      </label>
      {multiline ? (
        <textarea
          id={name}
          name={name}
          rows={4}
          className={`resize-none ${sharedClassName}`}
          placeholder={props.placeholder}
          required={props.required}
          value={props.value ?? ""}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        />
      ) : (
        <input
          id={name}
          name={name}
          type={props.type ?? "text"}
          className={sharedClassName}
          placeholder={props.placeholder}
          required={props.required}
          value={props.value ?? ""}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        />
      )}
    </div>
  );
}
