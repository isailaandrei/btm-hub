import { type ButtonHTMLAttributes } from "react";

export interface RoundedButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

const variantClasses: Record<
  NonNullable<RoundedButtonProps["variant"]>,
  string
> = {
  primary: "bg-primary text-white",
  secondary: "bg-muted text-white",
  ghost: "bg-transparent border border-white text-white",
};

export function RoundedButton({
  variant = "primary",
  className = "",
  children,
  ...props
}: RoundedButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full px-8 py-4 text-base font-normal transition-opacity hover:opacity-90 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
