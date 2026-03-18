import { type HTMLAttributes } from "react";

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "primary" | "secondary" | "ghost";
}

const variantClasses: Record<NonNullable<TagProps["variant"]>, string> = {
  primary:
    "bg-primary border-primary text-white",
  secondary:
    "bg-primary/10 border-primary/30 text-primary",
  ghost: "bg-transparent border-border text-muted-foreground",
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
