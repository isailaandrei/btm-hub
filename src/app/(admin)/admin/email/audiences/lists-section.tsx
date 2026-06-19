"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Plus,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  EmailListMemberRow,
  EmailListSummary,
} from "@/lib/data/email-lists";
import {
  addEmailListMembersAction,
  createEmailListAction,
  deleteEmailListAction,
  getEmailListAction,
  loadAudienceContactsAction,
  loadEmailListsAction,
  removeEmailListMemberAction,
  updateEmailListAction,
} from "../actions";

interface PickerContact {
  id: string;
  name: string;
  email: string;
}

export function ListsSection() {
  const [lists, setLists] = useState<EmailListSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [membersByList, setMembersByList] = useState<
    Record<string, EmailListMemberRow[] | undefined>
  >({});
  const [isCreating, setIsCreating] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [addOpenId, setAddOpenId] = useState<string | null>(null);
  const [addQuery, setAddQuery] = useState("");
  const [contacts, setContacts] = useState<PickerContact[] | null>(null);
  const [busyAddContactId, setBusyAddContactId] = useState<string | null>(null);
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
    setAddOpenId(null);
    if (membersByList[listId]) return;
    void loadMembers(listId);
  }

  async function loadMembers(listId: string) {
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

  function startRename(list: EmailListSummary) {
    setEditingNameId(list.id);
    setEditName(list.name);
  }

  function saveRename(list: EmailListSummary) {
    const name = editName.trim();
    if (!name || name === list.name) {
      setEditingNameId(null);
      return;
    }
    startMutateTransition(async () => {
      try {
        await updateEmailListAction({
          id: list.id,
          name,
          description: list.description,
        });
        setLists((current) =>
          (current ?? []).map((item) =>
            item.id === list.id ? { ...item, name } : item,
          ),
        );
        setEditingNameId(null);
        toast.success("List renamed.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to rename list.",
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

  function openAddPeople(listId: string) {
    if (addOpenId === listId) {
      setAddOpenId(null);
      return;
    }
    setAddOpenId(listId);
    setAddQuery("");
    if (contacts === null) {
      void (async () => {
        try {
          const result = await loadAudienceContactsAction();
          setContacts(result.contacts);
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Failed to load contacts.",
          );
          setContacts([]);
        }
      })();
    }
  }

  function addPerson(listId: string, contact: PickerContact) {
    setBusyAddContactId(contact.id);
    startMutateTransition(async () => {
      try {
        const { added } = await addEmailListMembersAction({
          listId,
          contactIds: [contact.id],
        });
        // Re-fetch members so the list + count reflect the new member exactly.
        await loadMembers(listId);
        setLists((current) =>
          (current ?? []).map((l) =>
            l.id === listId ? { ...l, memberCount: l.memberCount + added } : l,
          ),
        );
        toast.success(
          added > 0
            ? `Added ${contact.name}.`
            : `${contact.name} is already on the list.`,
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to add member.",
        );
      } finally {
        setBusyAddContactId(null);
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
            change — build them by saving a selection while composing, adding
            people here, or from the Contacts tab.
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
            const isEditing = editingNameId === list.id;
            const members = membersByList[list.id];
            return (
              <div key={list.id}>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  {isEditing ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        autoFocus
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveRename(list);
                          if (event.key === "Escape") setEditingNameId(null);
                        }}
                        className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => saveRename(list)}
                        disabled={isMutating}
                        aria-label="Save name"
                        className="rounded-md bg-primary p-1.5 text-primary-foreground disabled:opacity-50"
                      >
                        <Check className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingNameId(null)}
                        aria-label="Cancel rename"
                        className="rounded-md border border-border p-1.5 text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
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
                  )}
                  {!isEditing && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startRename(list)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        <Pencil className="size-3.5" />
                        Rename
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
                  )}
                </div>
                {isExpanded && (
                  <div className="bg-muted/30 px-4 py-3">
                    <div className="mb-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => openAddPeople(list.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        <UserPlus className="size-3.5" />
                        {addOpenId === list.id ? "Done adding" : "Add people"}
                      </button>
                    </div>

                    {addOpenId === list.id && (
                      <AddPeoplePanel
                        contacts={contacts}
                        query={addQuery}
                        onQueryChange={setAddQuery}
                        existingContactIds={
                          new Set(
                            (members ?? [])
                              .map((m) => m.contactId)
                              .filter((id): id is string => Boolean(id)),
                          )
                        }
                        busyAddContactId={busyAddContactId}
                        onAdd={(contact) => addPerson(list.id, contact)}
                      />
                    )}

                    {members === undefined ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading members...
                      </div>
                    ) : members.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No members yet. Use “Add people” above, or save a
                        selection as this list while composing.
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

function AddPeoplePanel({
  contacts,
  query,
  onQueryChange,
  existingContactIds,
  busyAddContactId,
  onAdd,
}: {
  contacts: PickerContact[] | null;
  query: string;
  onQueryChange: (value: string) => void;
  existingContactIds: Set<string>;
  busyAddContactId: string | null;
  onAdd: (contact: PickerContact) => void;
}) {
  const results = useMemo(() => {
    if (!contacts) return [];
    const trimmed = query.trim().toLowerCase();
    return contacts
      .filter((contact) => !existingContactIds.has(contact.id))
      .filter(
        (contact) =>
          trimmed.length === 0 ||
          contact.name.toLowerCase().includes(trimmed) ||
          contact.email.toLowerCase().includes(trimmed),
      )
      .slice(0, 15);
  }, [contacts, query, existingContactIds]);

  return (
    <div className="mb-3 rounded-md border border-border bg-background p-2">
      <div className="flex items-center gap-2 rounded-md border border-border px-2">
        <Search className="size-3.5 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search contacts by name or email..."
          className="h-8 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      {contacts === null ? (
        <div className="flex items-center gap-2 px-1 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading contacts...
        </div>
      ) : results.length === 0 ? (
        <p className="px-1 py-3 text-sm text-muted-foreground">
          {query.trim()
            ? "No matching contacts (or all matches are already on the list)."
            : "Start typing to find contacts."}
        </p>
      ) : (
        <ul className="mt-2 flex max-h-[220px] flex-col gap-1 overflow-auto">
          {results.map((contact) => (
            <li key={contact.id}>
              <button
                type="button"
                onClick={() => onAdd(contact)}
                disabled={busyAddContactId === contact.id}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {contact.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {contact.email}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-primary">
                  {busyAddContactId === contact.id ? "Adding…" : "Add"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
