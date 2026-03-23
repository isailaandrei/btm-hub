"use client";

import {
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";

export interface MentionItem {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: { id: string; label: string }) => void;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  function MentionList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [prevItems, setPrevItems] = useState(items);
    if (prevItems !== items) {
      setPrevItems(items);
      setSelectedIndex(0);
    }

    function selectItem(index: number) {
      const item = items[index];
      if (!item) return;
      command({ id: item.id, label: item.display_name ?? item.id });
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="rounded-lg border border-border bg-popover p-2 text-xs text-muted-foreground shadow-md">
          No users found
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-border bg-popover shadow-md overflow-hidden">
        {items.map((item, index) => {
          const initials = (item.display_name || "?")
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectItem(index)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {initials}
              </div>
              <span>{item.display_name ?? "Unknown"}</span>
            </button>
          );
        })}
      </div>
    );
  },
);
