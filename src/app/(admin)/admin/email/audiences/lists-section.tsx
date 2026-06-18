"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, Users, X } from "lucide-react";
import { toast } from "sonner";
import type {
  EmailListMemberRow,
  EmailListSummary,
} from "@/lib/data/email-lists";
import {
  createEmailListAction,
  deleteEmailListAction,
  getEmailListAction,
  loadEmailListsAction,
  removeEmailListMemberAction,
} from "../actions";

export function ListsSection() {
  const [lists, setLists] = useState<EmailListSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [membersByList, setMembersByList] = useState<
    Record<string, EmailListMemberRow[] | undefined>
  >({});
  const [isCreating, setIsCreating] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [, startLoadTransition] = useTransition();
  const [isMutating, startMutateTransition] = useTransition();

  function load() {
    startLoadTransition(async () => {
      try {
        const result = await loadEmailListsAction();
        setLists(result.lists);
        setLoadError(null);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load lists.",
        );
      }
    });
  }

  useEffect(() => {
    load();
  }, []);

  function toggleExpand(listId: string) {
    if (expandedId === listId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(listId);
    if (membersByList[listId]) return;
    void (async () => {
      try {
        const result = await getEmailListAction(listId);
        setMembersByList((current) => ({
          ...current,
          [listId]: result?.members ?? [],
        }));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load members.",
        );
      }
    })();
  }

  function handleCreate() {
    const name = newListName.trim();
    if (!name) return;
    startMutateTransition(async () => {
      try {
        await createEmailListAction({ name });
        setNewListName("");
        setIsCreating(false);
        toast.success("List created.");
        load();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to create list.",
        );
      }
    });
  }

  function handleDelete(list: EmailListSummary) {
    startMutateTransition(async () => {
      try {
        await deleteEmailListAction(list.id);
        setLists((current) => (current ?? []).filter((l) => l.id !== list.id));
        if (expandedId === list.id) setExpandedId(null);
        toast.success("List deleted.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to delete list.",
        );
      }
    });
  }

  function handleRemoveMember(listId: string, member: EmailListMemberRow) {
    startMutateTransition(async () => {
      try {
        await removeEmailListMemberAction(member.id);
        setMembersByList((current) => ({
          ...current,
          [listId]: (current[listId] ?? []).filter((m) => m.id !== member.id),
        }));
        setLists((current) =>
          (current ?? []).map((l) =>
            l.id === listId
              ? { ...l, memberCount: Math.max(0, l.memberCount - 1) }
              : l,
          ),
        );
        toast.success("Member removed.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to remove member.",
        );
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-medium text-foreground">Lists</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Reusable, fixed groups of recipients. Membership stays put when tags
            change — build them by saving a selection while composing.
          </p>
        </div>
        {isCreating ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleCreate();
                if (event.key === "Escape") setIsCreating(false);
              }}
              placeholder="List name"
              className="h-8 rounded-md border border-border bg-background px-3 text-sm"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={isMutating || !newListName.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Plus className="size-3.5" />
            New list
          </button>
        )}
      </div>

      {lists === null ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading lists...
        </div>
      ) : loadError ? (
        <div className="flex flex-col gap-3 px-4 py-6">
          <p className="text-sm text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={load}
            className="w-fit rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground"
          >
            Retry
          </button>
        </div>
      ) : lists.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          No lists yet. Create one, or save a selection as a list while composing.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {lists.map((list) => {
            const isExpanded = expandedId === list.id;
            const members = membersByList[list.id];
            return (
              <div key={list.id}>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(list.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {isExpanded ? (
                      <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {list.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {list.memberCount}{" "}
                        {list.memberCount === 1 ? "member" : "members"}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(list)}
                    disabled={isMutating}
                    className="rounded-md border border-destructive/50 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
                {isExpanded && (
                  <div className="bg-muted/30 px-4 py-3">
                    {members === undefined ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading members...
                      </div>
                    ) : members.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No members yet. Add people by saving a selection as this
                        list while composing.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {members.map((member) => (
                          <li
                            key={member.id}
                            className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-foreground">
                                {member.name}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {member.email}
                                {member.source === "manual"
                                  ? " · saved recipient"
                                  : ""}
                              </span>
                            </span>
                            <button
                              type="button"
                              aria-label={`Remove ${member.name}`}
                              onClick={() => handleRemoveMember(list.id, member)}
                              disabled={isMutating}
                              className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                            >
                              <X className="size-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
