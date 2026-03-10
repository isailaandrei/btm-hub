import { type HTMLAttributes } from "react";

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "primary" | "secondary" | "ghost";
}

const variantClasses: Record<NonNullable<TagProps["variant"]>, string> = {
  primary:
    "bg-brand-primary border-brand-primary text-brand-light-bg",
  secondary:
    "bg-brand-secondary border-brand-primary text-brand-light-bg",
  ghost: "bg-transparent border-white text-white",
};

export function Tag({
  variant = "primary",
  className = "",
  children,
  ...props
}: TagProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-4 py-2 text-base font-normal ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
