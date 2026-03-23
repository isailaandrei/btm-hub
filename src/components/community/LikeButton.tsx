"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toggleLike } from "@/app/(marketing)/community/actions";
import { cn } from "@/lib/utils";
import type { ForumLikeWithUser } from "@/types/database";
import * as Popover from "@radix-ui/react-popover";

interface LikeButtonProps {
  postId: string;
  likeCount: number;
  liked: boolean;
}

export function LikeButton({ postId, likeCount, liked }: LikeButtonProps) {
  const [optimisticLiked, setOptimisticLiked] = useState(liked);
  const [optimisticCount, setOptimisticCount] = useState(likeCount);
  const [isPending, startTransition] = useTransition();
  const [likedBy, setLikedBy] = useState<ForumLikeWithUser[] | null>(null);
  const [loadingLikes, setLoadingLikes] = useState(false);

  function handleToggle() {
    const newLiked = !optimisticLiked;
    setOptimisticLiked(newLiked);
    setOptimisticCount((c) => c + (newLiked ? 1 : -1));
    setLikedBy(null); // reset cached list

    startTransition(async () => {
      try {
        await toggleLike(postId);
      } catch {
        // Revert on error
        setOptimisticLiked(!newLiked);
        setOptimisticCount((c) => c + (newLiked ? -1 : 1));
      }
    });
  }

  async function loadLikedBy() {
    if (likedBy !== null || loadingLikes) return;
    setLoadingLikes(true);
    try {
      const res = await fetch(`/api/community/likes?postId=${postId}`);
      if (res.ok) {
        setLikedBy(await res.json());
      }
    } finally {
      setLoadingLikes(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={cn(
          "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
          optimisticLiked
            ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Heart
          className={cn("h-3.5 w-3.5", optimisticLiked && "fill-current")}
        />
        {optimisticCount > 0 && <span>{optimisticCount}</span>}
      </button>

      {optimisticCount > 0 && (
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              onClick={loadLikedBy}
              className="text-xs text-muted-foreground hover:underline"
            >
              {optimisticCount === 1 ? "1 like" : `${optimisticCount} likes`}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="z-50 w-56 rounded-lg border border-border bg-popover p-3 shadow-md"
              sideOffset={4}
              align="start"
            >
              <p className="mb-2 text-xs font-medium text-foreground">
                Liked by
              </p>
              {loadingLikes && (
                <p className="text-xs text-muted-foreground">Loading...</p>
              )}
              {likedBy && likedBy.length === 0 && (
                <p className="text-xs text-muted-foreground">No likes yet</p>
              )}
              {likedBy && (
                <div className="flex flex-col gap-1.5">
                  {likedBy.map((like) => (
                    <div
                      key={like.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                        {(like.user?.display_name || "?")
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <span className="text-foreground">
                        {like.user?.display_name ?? "Unknown"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
}
