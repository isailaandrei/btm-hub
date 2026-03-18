import { type ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-primary text-white",
  secondary: "bg-muted text-white",
  ghost: "bg-transparent border border-white text-white",
};

export function BrandButton({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-[4px] px-8 py-4 text-base font-normal transition-opacity hover:opacity-90 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
