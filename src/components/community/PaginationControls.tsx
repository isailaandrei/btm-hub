import Link from "next/link";
import type { Cursor } from "@/lib/data/forum";
import { Button } from "@/components/ui/button";

interface PaginationControlsProps {
  nextCursor: Cursor | null;
  basePath: string;
}

export function PaginationControls({ nextCursor, basePath }: PaginationControlsProps) {
  if (!nextCursor) return null;

  let href: string;

  if ("offset" in nextCursor) {
    // Offset-based pagination (replies ordered by likes)
    const separator = basePath.includes("?") ? "&" : "?";
    href = `${basePath}${separator}offset=${nextCursor.offset}`;
  } else {
    // Cursor-based pagination (threads by timestamp)
    const params = new URLSearchParams({
      cursor: nextCursor.ts,
      cursor_id: nextCursor.id,
    });
    const separator = basePath.includes("?") ? "&" : "?";
    href = `${basePath}${separator}${params.toString()}`;
  }

  return (
    <div className="mt-8 flex justify-center">
      <Button variant="outline" asChild>
        <Link href={href}>
          Next Page
        </Link>
      </Button>
    </div>
  );
}
