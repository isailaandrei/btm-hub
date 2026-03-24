import Image from "next/image";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-10 w-10 text-sm",
} as const;

/**
 * Deterministic HSL hue from a string — same name always gets the same color.
 */
function nameToHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function getInitials(name: string | null): string {
  return (name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function UserAvatar({ name, avatarUrl, size = "md", className }: UserAvatarProps) {
  const sizeClass = SIZES[size];

  if (avatarUrl) {
    const pxSize = size === "sm" ? 28 : size === "md" ? 36 : 40;
    return (
      <Image
        src={avatarUrl}
        alt={name ?? "User"}
        width={pxSize}
        height={pxSize}
        className={cn("shrink-0 rounded-full object-cover", sizeClass, className)}
      />
    );
  }

  const hue = nameToHue(name || "?");

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        sizeClass,
        className,
      )}
      style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
      aria-label={name ?? "User avatar"}
      role="img"
    >
      {getInitials(name)}
    </div>
  );
}
