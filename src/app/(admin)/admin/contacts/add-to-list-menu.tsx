"use client";

import { useState } from "react";
import { ListPlus, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { EmailListSummary } from "@/lib/data/email-lists";
import {
  addEmailListMembersAction,
  createEmailListAction,
  loadEmailListsAction,
} from "../email/actions";

/**
 * Bulk action: add the selected contacts to an existing mailing list, or create
 * a new list from them. Lets admins build a list by selecting people across tag
 * filters and dropping each batch into the same list.
 */
export function AddToListMenu({ contactIds }: { contactIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<EmailListSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const count = contactIds.length;
  const contactLabel = `${count} contact${count === 1 ? "" : "s"}`;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Reload every open so a list created here (or elsewhere) shows up and
      // member counts stay fresh; keep the previous data visible while loading.
      void (async () => {
        try {
          const result = await loadEmailListsAction();
          setLists(result.lists);
        } catch {
          toast.error("Failed to load lists.");
          setLists((current) => current ?? []);
        }
      })();
    }
    if (!next) {
      setIsCreating(false);
      setNewName("");
    }
  }

  async function addToExisting(list: EmailListSummary) {
    setBusyId(list.id);
    try {
      const { added } = await addEmailListMembersAction({
        listId: list.id,
        contactIds,
      });
      toast.success(
        added > 0
          ? `Added ${added} to ${list.name}.`
          : `Those contacts are already in ${list.name}.`,
      );
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add to list.",
      );
    } finally {
      setBusyId(null);
    }
  }

  function createFromSelection() {
    const name = newName.trim();
    if (!name) return;
    setIsWorking(true);
    void (async () => {
      try {
        const { list } = await createEmailListAction({ name, contactIds });
        toast.success(`Created "${list.name}" with ${contactLabel}.`);
        setOpen(false);
        setIsCreating(false);
        setNewName("");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to create list.",
        );
      } finally {
        setIsWorking(false);
      }
    })();
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ListPlus className="h-4 w-4" />
          Add to list
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        {isCreating ? (
          <div className="flex flex-col gap-2 p-1">
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") createFromSelection();
                if (event.key === "Escape") setIsCreating(false);
              }}
              placeholder="New list name"
              className="h-8 rounded-md border border-border bg-background px-3 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={createFromSelection}
                disabled={isWorking || !newName.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {isWorking ? "Creating..." : `Create with ${contactLabel}`}
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              <Plus className="size-3.5" />
              New list from selection
            </button>
            <div className="my-1 border-t border-border" />
            <div className="max-h-[240px] overflow-auto">
              {lists === null ? (
                <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading lists...
                </div>
              ) : lists.length === 0 ? (
                <p className="px-2 py-2 text-sm text-muted-foreground">
                  No lists yet — create one above.
                </p>
              ) : (
                lists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => addToExisting(list)}
                    disabled={busyId === list.id}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <span className="min-w-0 truncate">{list.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {busyId === list.id ? "…" : list.memberCount}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
