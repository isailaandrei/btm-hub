"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { Hash, PenSquare, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createTopic } from "@/app/(marketing)/community/actions";
import type { ForumTopic } from "@/types/database";
import type { ForumActionState } from "@/app/(marketing)/community/actions";
import { MessagesSidebar } from "./MessagesSidebar";

interface ChannelSidebarProps {
  topics: ForumTopic[];
  isAuthenticated: boolean;
  isAdmin: boolean;
  currentUserId: string | null;
}

const initialState: ForumActionState = {
  errors: null,
  message: "",
  success: false,
  resetKey: 0,
};

export function ChannelSidebar({ topics, isAuthenticated, isAdmin, currentUserId }: ChannelSidebarProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeTopic = searchParams.get("topic");
  const isOnFeed = pathname === "/community";
  const [showAddForm, setShowAddForm] = useState(false);
  const [prevResetKey, setPrevResetKey] = useState(0);
  const [state, formAction, isPending] = useActionState(createTopic, initialState);

  // Close form on success (previous-value-in-state pattern — no useEffect)
  if (state.success && state.resetKey !== prevResetKey) {
    setPrevResetKey(state.resetKey);
    setShowAddForm(false);
  }

  return (
    <aside className="hidden w-56 shrink-0 md:block">
      <div className="sticky top-24 flex flex-col gap-6">
        {/* Channel list */}
        <div>
          <div className="mb-2 flex items-center justify-between px-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Channels
            </h2>
            {isAdmin && !showAddForm && (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                title="Add channel"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <nav className="flex flex-col gap-0.5">
            <Link
              href="/community"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                isOnFeed && !activeTopic
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Hash className="h-4 w-4 shrink-0" />
              Home
            </Link>

            {topics.map((topic) => (
              <Link
                key={topic.slug}
                href={`/community?topic=${topic.slug}`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                  activeTopic === topic.slug
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Hash className="h-4 w-4 shrink-0" />
                <span className="truncate">{topic.name}</span>
              </Link>
            ))}
          </nav>

          {/* Add channel form (admin only) */}
          {isAdmin && showAddForm && (
            <form action={formAction} className="mt-2 px-1">
              <div className="flex items-center gap-1">
                <input
                  key={state.resetKey}
                  name="name"
                  placeholder="Channel name"
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                  disabled={isPending}
                />
                <Button type="submit" size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={isPending}>
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setShowAddForm(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {state.errors?.name && (
                <p className="mt-1 px-1 text-xs text-destructive">{state.errors.name}</p>
              )}
              {state.message && !state.success && (
                <p className="mt-1 px-1 text-xs text-destructive">{state.message}</p>
              )}
            </form>
          )}
        </div>

        {/* Messages section — fetches its own data to avoid blocking community pages */}
        {isAuthenticated && currentUserId && (
          <>
            <div className="border-t border-border" />
            <MessagesSidebar currentUserId={currentUserId} />
          </>
        )}

        {/* New post button */}
        {isAuthenticated && (
          <Button asChild className="gap-2">
            <Link href="/community/new">
              <PenSquare className="h-4 w-4" />
              New Post
            </Link>
          </Button>
        )}
      </div>
    </aside>
  );
}
