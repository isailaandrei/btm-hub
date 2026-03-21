import Link from "next/link";
import type { CursorPair } from "@/lib/data/forum";
import { Button } from "@/components/ui/button";

interface PaginationControlsProps {
  nextCursor: CursorPair | null;
  basePath: string;
}

export function PaginationControls({ nextCursor, basePath }: PaginationControlsProps) {
  if (!nextCursor) return null;

  const params = new URLSearchParams({
    cursor: nextCursor.ts,
    cursor_id: nextCursor.id,
  });

  return (
    <div className="mt-8 flex justify-center">
      <Button variant="outline" asChild>
        <Link href={`${basePath}?${params.toString()}`}>
          Next Page
        </Link>
      </Button>
    </div>
  );
}
