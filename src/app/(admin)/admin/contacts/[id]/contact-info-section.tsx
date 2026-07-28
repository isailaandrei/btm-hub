"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ContactInfoField } from "@/types/database";
import {
  createContactInfoFieldAction,
  loadContactInfoSection,
  removeContactInfoValueAction,
  setContactInfoValueAction,
} from "./contact-info-actions";

type ContactInfoSectionData = Awaited<ReturnType<typeof loadContactInfoSection>>;
type ContactInfoValueRow = ContactInfoSectionData["values"][number];

const INPUT_CLASS =
  "rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60";

function buildOptimisticRow(
  field: ContactInfoField,
  value: string,
): ContactInfoValueRow {
  return {
    field_id: field.id,
    value,
    updated_at: new Date().toISOString(),
    contact_info_fields: {
      id: field.id,
      name: field.name,
      sort_order: field.sort_order,
    },
  };
}

/**
 * Full-width "Contact Info" card on the contact detail page: admin-defined
 * person-level fields (Insurance number, Address, Rashguard size, …) shown as
 * label/value pairs, with inline add/edit/remove. Fields are shared across
 * contacts; values are per-contact free text. Mirrors `ContactEmailSection`'s
 * lazy-load/skeleton/error+retry shape and `ContactWhatsAppSection`'s
 * serialized-mutation (`isMutating`) gate.
 */
export function ContactInfoSection({
  contactId,
  initialData = null,
  revalidateInitialData = false,
  onDataLoaded,
}: {
  contactId: string;
  /** Server-seeded or session-cached fields+values; null → lazy-load. */
  initialData?: ContactInfoSectionData | null;
  /** True when `initialData` is session-cached rather than a fresh seed. */
  revalidateInitialData?: boolean;
  /** Session-cache write-back — called with every successfully loaded slice. */
  onDataLoaded?: (data: ContactInfoSectionData) => void;
}) {
  const [data, setData] = useState<ContactInfoSectionData | null>(initialData);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isMutating, startMutation] = useTransition();
  const [addOpen, setAddOpen] = useState(false);

  const applyData = useCallback(
    (next: ContactInfoSectionData) => {
      setData(next);
      onDataLoaded?.(next);
    },
    [onDataLoaded],
  );

  const loadData = useCallback(() => {
    startTransition(async () => {
      try {
        setLoadError(null);
        applyData(await loadContactInfoSection(contactId));
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load info.",
        );
      }
    });
  }, [applyData, contactId]);

  useEffect(() => {
    if (data || isPending || loadError) return;
    loadData();
  }, [data, isPending, loadData, loadError]);

  // Stale-while-revalidate for cached initial data — one background re-read,
  // guarded so it fires at most once per mount (mirrors sibling sections).
  const revalidatedRef = useRef(false);
  useEffect(() => {
    if (!revalidateInitialData || !initialData || revalidatedRef.current) {
      return;
    }
    revalidatedRef.current = true;
    loadData();
  }, [initialData, loadData, revalidateInitialData]);

  const sortedValues = useMemo(() => {
    if (!data) return [];
    return [...data.values].sort(
      (a, b) =>
        a.contact_info_fields.sort_order - b.contact_info_fields.sort_order,
    );
  }, [data]);

  const unsetFields = useMemo(() => {
    if (!data) return [];
    const setFieldIds = new Set(data.values.map((value) => value.field_id));
    return data.fields.filter((field) => !setFieldIds.has(field.id));
  }, [data]);

  // Serialized mutation runner: at most one in flight (siblings disable their
  // own affordances via `isMutating` from this same transition). When given,
  // `optimisticNext` is applied immediately and rolled back to the exact
  // pre-mutation snapshot if the mutation throws. Every SUCCESSFUL mutation
  // re-reads via `loadContactInfoSection` and pushes the result through BOTH
  // local state and `onDataLoaded` — a deep-link-seeded ("seed") cache entry
  // otherwise never revalidates on its own and would keep serving pre-edit
  // values for the rest of the session (see `contact-detail-cache`).
  const runMutation = useCallback(
    (
      optimisticNext: ContactInfoSectionData | null,
      mutation: () => Promise<void>,
    ) => {
      let previous: ContactInfoSectionData | null = null;
      if (optimisticNext) {
        setData((current) => {
          previous = current;
          return optimisticNext;
        });
      }
      startMutation(async () => {
        try {
          await mutation();
          applyData(await loadContactInfoSection(contactId));
        } catch (error) {
          if (optimisticNext) setData(previous);
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to update contact info. Please try again.",
          );
        }
      });
    },
    [applyData, contactId],
  );

  const handleAddExisting = useCallback(
    (field: ContactInfoField, value: string) => {
      if (!data) return;
      setAddOpen(false);
      const optimisticNext: ContactInfoSectionData = {
        ...data,
        values: [
          ...data.values.filter((row) => row.field_id !== field.id),
          buildOptimisticRow(field, value),
        ],
      };
      runMutation(optimisticNext, () =>
        setContactInfoValueAction({ contactId, fieldId: field.id, value }),
      );
    },
    [contactId, data, runMutation],
  );

  const handleCreate = useCallback(
    (name: string, value: string) => {
      setAddOpen(false);
      // No optimistic pre-state: the field id isn't known until the server
      // responds (and may reuse an existing field case-insensitively) — the
      // pair is merged in as soon as it is.
      runMutation(null, async () => {
        const field = await createContactInfoFieldAction({
          contactId,
          name,
          value,
        });
        setData((current) =>
          current
            ? {
                fields: current.fields.some((f) => f.id === field.id)
                  ? current.fields
                  : [...current.fields, field],
                values: [
                  ...current.values.filter((row) => row.field_id !== field.id),
                  buildOptimisticRow(field, value),
                ],
              }
            : current,
        );
      });
    },
    [contactId, runMutation],
  );

  const handleEditSave = useCallback(
    (fieldId: string, value: string) => {
      if (!data) return;
      const optimisticNext: ContactInfoSectionData = {
        ...data,
        values: data.values.map((row) =>
          row.field_id === fieldId
            ? { ...row, value, updated_at: new Date().toISOString() }
            : row,
        ),
      };
      runMutation(optimisticNext, () =>
        setContactInfoValueAction({ contactId, fieldId, value }),
      );
    },
    [contactId, data, runMutation],
  );

  const handleRemove = useCallback(
    (fieldId: string) => {
      if (!data) return;
      const optimisticNext: ContactInfoSectionData = {
        ...data,
        values: data.values.filter((row) => row.field_id !== fieldId),
      };
      runMutation(optimisticNext, () =>
        removeContactInfoValueAction({ contactId, fieldId }),
      );
    },
    [contactId, data, runMutation],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">
          Contact Info
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-destructive">{loadError}</p>
            <button
              type="button"
              onClick={loadData}
              disabled={isPending}
              className="w-fit rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
            >
              {isPending ? "Retrying..." : "Retry"}
            </button>
          </div>
        ) : data === null ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <div className="h-6 w-24 animate-pulse rounded bg-muted" />
            <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            {sortedValues.map((row) => (
              <InfoPair
                key={row.field_id}
                row={row}
                disabled={isMutating}
                onSave={(value) => handleEditSave(row.field_id, value)}
                onRemove={() => handleRemove(row.field_id)}
              />
            ))}
            <AddInfoPopover
              open={addOpen}
              onOpenChange={setAddOpen}
              unsetFields={unsetFields}
              disabled={isMutating}
              onSelectExisting={handleAddExisting}
              onCreate={handleCreate}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoPair({
  row,
  disabled,
  onSave,
  onRemove,
}: {
  row: ContactInfoValueRow;
  disabled: boolean;
  onSave: (value: string) => void;
  onRemove: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(row.value);
  // Enter and blur can both fire for the same keystroke (committing on Enter
  // unmounts the input, and the resulting focus loss can also dispatch blur) —
  // this gate makes commit/cancel idempotent per edit session regardless of
  // which fires first.
  const finishedRef = useRef(false);

  function startEdit() {
    finishedRef.current = false;
    setDraft(row.value);
    setIsEditing(true);
  }

  function commit() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== row.value) onSave(trimmed);
  }

  function cancel() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setDraft(row.value);
    setIsEditing(false);
  }

  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {row.contact_info_fields.name}
      </span>
      {isEditing ? (
        <span className="inline-flex items-center gap-1.5">
          <input
            type="text"
            autoFocus
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            onBlur={commit}
            disabled={disabled}
            className={`${INPUT_CLASS} h-7 w-44`}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove ${row.contact_info_fields.name}`}
            className="text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
          >
            Remove
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          disabled={disabled}
          className="whitespace-pre-wrap break-words text-left text-sm text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
        >
          {row.value}
        </button>
      )}
    </span>
  );
}

function AddInfoPopover({
  open,
  onOpenChange,
  unsetFields,
  disabled,
  onSelectExisting,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unsetFields: ContactInfoField[];
  disabled: boolean;
  onSelectExisting: (field: ContactInfoField, value: string) => void;
  onCreate: (name: string, value: string) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Add contact info field"
          className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          + Info
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        {/* Picker state lives below PopoverContent, which unmounts on close —
            every open starts fresh without a reset effect
            (react-hooks/set-state-in-effect). */}
        <AddInfoPicker
          unsetFields={unsetFields}
          onSelectExisting={onSelectExisting}
          onCreate={onCreate}
        />
      </PopoverContent>
    </Popover>
  );
}

function AddInfoPicker({
  unsetFields,
  onSelectExisting,
  onCreate,
}: {
  unsetFields: ContactInfoField[];
  onSelectExisting: (field: ContactInfoField, value: string) => void;
  onCreate: (name: string, value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ContactInfoField | "create" | null>(
    null,
  );
  const [createName, setCreateName] = useState("");
  const [valueDraft, setValueDraft] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filteredFields = useMemo(
    () =>
      normalizedQuery
        ? unsetFields.filter((field) =>
            field.name.toLowerCase().includes(normalizedQuery),
          )
        : unsetFields,
    [normalizedQuery, unsetFields],
  );
  // Checked against the fields NOT yet set on this contact, not all fields —
  // if a same-named field is already set here, "Create" still shows and the
  // server-side create/reuse RPC dedupes it case-insensitively.
  const hasExactMatch = unsetFields.some(
    (field) => field.name.toLowerCase() === normalizedQuery,
  );
  const showCreate = normalizedQuery.length > 0 && !hasExactMatch;

  function submitValue() {
    const value = valueDraft.trim();
    if (!value) return;
    if (selected === "create") {
      onCreate(createName, value);
    } else if (selected) {
      onSelectExisting(selected, value);
    }
  }

  return selected ? (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">
        {selected === "create" ? createName : selected.name}
      </p>
      <input
        type="text"
        autoFocus
        value={valueDraft}
        maxLength={2000}
        placeholder="Value"
        onChange={(e) => setValueDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submitValue();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setSelected(null);
            setValueDraft("");
          }
        }}
        className={`${INPUT_CLASS} w-full`}
      />
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        autoFocus
        value={query}
        placeholder="Search or create a field..."
        onChange={(e) => setQuery(e.target.value)}
        className={`${INPUT_CLASS} w-full`}
      />
      <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
        {filteredFields.map((field) => (
          <button
            key={field.id}
            type="button"
            onClick={() => {
              setValueDraft("");
              setSelected(field);
            }}
            className="rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            {field.name}
          </button>
        ))}
        {showCreate && (
          <button
            type="button"
            onClick={() => {
              setCreateName(query.trim());
              setValueDraft("");
              setSelected("create");
            }}
            className="rounded-md px-2 py-1.5 text-left text-sm text-primary transition-colors hover:bg-muted"
          >
            Create &quot;{query.trim()}&quot;
          </button>
        )}
        {filteredFields.length === 0 && !showCreate && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No fields to add.
          </p>
        )}
      </div>
    </div>
  );
}
