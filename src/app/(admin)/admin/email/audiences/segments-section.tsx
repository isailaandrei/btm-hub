"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Plus, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";
import type {
  EmailSegmentRule,
  Tag,
  TagCategory,
} from "@/types/database";
import type { EmailSegmentSummary } from "@/lib/data/email-segments";
import {
  createEmailSegmentAction,
  deleteEmailSegmentAction,
  loadAudienceTagsAction,
  loadEmailSegmentsAction,
  previewSegmentCountAction,
  updateEmailSegmentAction,
} from "../actions";

const EMPTY_RULE: EmailSegmentRule = {
  match: "all",
  includeTagIds: [],
  excludeTagIds: [],
};

interface EditorState {
  id: string | null; // null = creating
  name: string;
  rule: EmailSegmentRule;
}

export function SegmentsSection() {
  const [segments, setSegments] = useState<EmailSegmentSummary[] | null>(null);
  const [categories, setCategories] = useState<TagCategory[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [isCounting, setIsCounting] = useState(false);
  const [isMutating, startMutateTransition] = useTransition();

  function load() {
    void (async () => {
      try {
        const [segmentsResult, tagsResult] = await Promise.all([
          loadEmailSegmentsAction(),
          loadAudienceTagsAction(),
        ]);
        setSegments(segmentsResult.segments);
        setCategories(tagsResult.categories);
        setTags(tagsResult.tags);
        setLoadError(null);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load segments.",
        );
      }
    })();
  }

  useEffect(() => {
    load();
  }, []);

  const tagsByCategory = useMemo(() => {
    const map = new Map<string, Tag[]>();
    for (const tag of tags) {
      const list = map.get(tag.category_id) ?? [];
      list.push(tag);
      map.set(tag.category_id, list);
    }
    return map;
  }, [tags]);

  const tagName = useMemo(() => {
    const map = new Map<string, string>();
    for (const tag of tags) map.set(tag.id, tag.name);
    return map;
  }, [tags]);

  // Live "matches ~N contacts" preview, debounced, while editing.
  useEffect(() => {
    if (!editor || editor.rule.includeTagIds.length === 0) {
      setLiveCount(null);
      setIsCounting(false);
      return;
    }
    setIsCounting(true);
    const rule = editor.rule;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await previewSegmentCountAction(rule);
          setLiveCount(result.count);
        } catch {
          setLiveCount(null);
        } finally {
          setIsCounting(false);
        }
      })();
    }, 400);
    return () => window.clearTimeout(handle);
  }, [editor]);

  function startCreate() {
    setEditor({ id: null, name: "", rule: { ...EMPTY_RULE } });
    setLiveCount(null);
  }

  function startEdit(segment: EmailSegmentSummary) {
    // Drop any legacy tag-level excludes so the editor (and live count) reflect
    // the include-only model; they're cleared on save too.
    setEditor({
      id: segment.id,
      name: segment.name,
      rule: { ...segment.rule, excludeTagIds: [] },
    });
  }

  function toggleIncludeTag(tagId: string) {
    if (!editor) return;
    const current = editor.rule.includeTagIds;
    const nextInclude = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    setEditor({
      ...editor,
      rule: { ...editor.rule, includeTagIds: nextInclude },
    });
  }

  function handleSave() {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) {
      toast.error("Give the segment a name.");
      return;
    }
    if (editor.rule.includeTagIds.length === 0) {
      toast.error("Pick at least one tag to include.");
      return;
    }
    // Segments are include-only — global exclusions are handled on the Excluded
    // tag, so never carry tag-level excludes (even from older saved segments).
    const rule: EmailSegmentRule = {
      match: editor.rule.match,
      includeTagIds: editor.rule.includeTagIds,
      excludeTagIds: [],
    };
    startMutateTransition(async () => {
      try {
        if (editor.id) {
          await updateEmailSegmentAction({
            id: editor.id,
            name,
            rule,
          });
        } else {
          await createEmailSegmentAction({ name, rule });
        }
        setEditor(null);
        toast.success(editor.id ? "Segment updated." : "Segment created.");
        load();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save segment.",
        );
      }
    });
  }

  function handleDelete(segment: EmailSegmentSummary) {
    startMutateTransition(async () => {
      try {
        await deleteEmailSegmentAction(segment.id);
        setSegments((current) =>
          (current ?? []).filter((s) => s.id !== segment.id),
        );
        if (editor?.id === segment.id) setEditor(null);
        toast.success("Segment deleted.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to delete segment.",
        );
      }
    });
  }

  function renderRuleSummary(rule: EmailSegmentRule) {
    const inc = rule.includeTagIds.map((id) => tagName.get(id) ?? "?").join(", ");
    return (
      <>
        Has {rule.match === "all" ? "all" : "any"} of: {inc || "—"}
      </>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-medium text-foreground">Segments</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Saved tag rules, re-evaluated every send — so a segment always
            reaches whoever matches right now.
          </p>
        </div>
        {!editor && (
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Plus className="size-3.5" />
            New segment
          </button>
        )}
      </div>

      {editor && (
        <div className="border-b border-border bg-muted/30 px-4 py-4">
          <div className="flex flex-col gap-4">
            <input
              autoFocus
              value={editor.name}
              onChange={(event) =>
                setEditor({ ...editor, name: event.target.value })
              }
              placeholder="Segment name"
              className="h-9 w-full max-w-sm rounded-md border border-border bg-background px-3 text-sm"
            />

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-muted-foreground">
                  Include contacts with
                </span>
                {(["all", "any"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      setEditor({
                        ...editor,
                        rule: { ...editor.rule, match: mode },
                      })
                    }
                    className={`rounded-md border px-3 py-1.5 font-medium ${
                      editor.rule.match === mode
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {mode === "all" ? "All tags" : "Any tag"}
                  </button>
                ))}
                <span className="ml-auto text-muted-foreground">
                  {editor.rule.includeTagIds.length === 0 ? (
                    "Pick tags below"
                  ) : isCounting ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="size-3.5 animate-spin" />
                      counting…
                    </span>
                  ) : (
                    `matches ~${liveCount ?? 0} contact${
                      liveCount === 1 ? "" : "s"
                    }`
                  )}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {editor.rule.match === "all"
                  ? "Only contacts who have every tag you pick below are included — the more tags, the narrower the segment."
                  : "Contacts who have at least one of the tags you pick below are included — the more tags, the wider the segment."}
              </p>
            </div>

            <TagPicker
              label="Tags"
              categories={categories}
              tagsByCategory={tagsByCategory}
              selected={editor.rule.includeTagIds}
              tone="include"
              onToggle={toggleIncludeTag}
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isMutating}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {editor.id ? "Save segment" : "Create segment"}
              </button>
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {segments === null ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading segments...
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
      ) : segments.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <TagIcon className="h-4 w-4" />
          No segments yet. Create one from a tag rule.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {segments.map((segment) => (
            <div
              key={segment.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {segment.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ~{segment.matchCount}{" "}
                    {segment.matchCount === 1 ? "contact" : "contacts"}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {renderRuleSummary(segment.rule)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(segment)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(segment)}
                  disabled={isMutating}
                  className="rounded-md border border-destructive/50 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TagPicker({
  label,
  categories,
  tagsByCategory,
  selected,
  tone,
  onToggle,
}: {
  label: string;
  categories: TagCategory[];
  tagsByCategory: Map<string, Tag[]>;
  selected: string[];
  tone: "include" | "exclude";
  onToggle: (tagId: string) => void;
}) {
  const activeClass =
    tone === "include"
      ? "border-primary bg-primary/10 text-primary"
      : "border-destructive/50 bg-destructive/10 text-destructive";
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex max-h-[200px] flex-col gap-2 overflow-auto">
        {categories.map((category) => {
          const categoryTags = tagsByCategory.get(category.id) ?? [];
          if (categoryTags.length === 0) return null;
          return (
            <div key={category.id}>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {category.name}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {categoryTags.map((tag) => {
                  const isSelected = selected.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => onToggle(tag.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        isSelected
                          ? activeClass
                          : "border-border text-foreground hover:bg-muted"
                      }`}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
