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
  previewSegmentCountAction,
  updateEmailSegmentAction,
} from "../actions";
import { useAdminEmailData } from "../admin-email-data-provider";

const EMPTY_RULE: EmailSegmentRule = {
  match: "all",
  includeTagIds: [],
  excludeTagIds: [],
};

// "everyone" = start from all contacts (an "everybody except …" segment);
// "tags" = start from contacts matching the include tags. The include picks are
// kept in state across a scope switch but only applied when scope === "tags".
type SegmentScope = "everyone" | "tags";

interface EditorState {
  id: string | null; // null = creating
  name: string;
  scope: SegmentScope;
  rule: EmailSegmentRule;
}

/** The rule actually saved/counted: include tags only count under "tags". */
function buildEffectiveRule(state: EditorState): EmailSegmentRule {
  return {
    match: state.rule.match,
    includeTagIds: state.scope === "tags" ? state.rule.includeTagIds : [],
    excludeTagIds: state.rule.excludeTagIds,
  };
}

function ruleTargetsSomeone(rule: EmailSegmentRule): boolean {
  return rule.includeTagIds.length + rule.excludeTagIds.length > 0;
}

export function SegmentsSection() {
  // Segments + the tag picker live in the provider, so they're cached across
  // tab switches and admin navigation — same as Compose/Sent.
  const {
    segments,
    segmentsError,
    ensureSegments,
    refreshSegments,
    setSegments,
    audienceTags,
    audienceTagsError,
    ensureAudienceTags,
    refreshAudienceTags,
  } = useAdminEmailData();
  const categories = useMemo(
    () => audienceTags?.categories ?? [],
    [audienceTags],
  );
  const tags = useMemo(() => audienceTags?.tags ?? [], [audienceTags]);
  const loadError = segmentsError ?? audienceTagsError;
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [isCounting, setIsCounting] = useState(false);
  const [isMutating, startMutateTransition] = useTransition();

  function reload() {
    void refreshSegments();
    void refreshAudienceTags();
  }

  useEffect(() => {
    void ensureSegments({ quiet: true });
    void ensureAudienceTags({ quiet: true });
  }, [ensureSegments, ensureAudienceTags]);

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
    if (!editor) {
      setLiveCount(null);
      setIsCounting(false);
      return;
    }
    const rule = buildEffectiveRule(editor);
    if (!ruleTargetsSomeone(rule)) {
      setLiveCount(null);
      setIsCounting(false);
      return;
    }
    setIsCounting(true);
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
    setEditor({ id: null, name: "", scope: "tags", rule: { ...EMPTY_RULE } });
    setLiveCount(null);
  }

  function startEdit(segment: EmailSegmentSummary) {
    setEditor({
      id: segment.id,
      name: segment.name,
      // No include tags on a saved rule means it's an "everyone except …" one.
      scope: segment.rule.includeTagIds.length > 0 ? "tags" : "everyone",
      rule: segment.rule,
    });
  }

  function setScope(scope: SegmentScope) {
    if (!editor) return;
    setEditor({ ...editor, scope });
  }

  // A tag can't be both included and excluded — toggling one side clears the
  // other for that tag.
  function toggleIncludeTag(tagId: string) {
    if (!editor) return;
    const include = editor.rule.includeTagIds;
    const nextInclude = include.includes(tagId)
      ? include.filter((id) => id !== tagId)
      : [...include, tagId];
    setEditor({
      ...editor,
      rule: {
        ...editor.rule,
        includeTagIds: nextInclude,
        excludeTagIds: editor.rule.excludeTagIds.filter((id) => id !== tagId),
      },
    });
  }

  function toggleExcludeTag(tagId: string) {
    if (!editor) return;
    const exclude = editor.rule.excludeTagIds;
    const nextExclude = exclude.includes(tagId)
      ? exclude.filter((id) => id !== tagId)
      : [...exclude, tagId];
    setEditor({
      ...editor,
      rule: {
        ...editor.rule,
        excludeTagIds: nextExclude,
        includeTagIds: editor.rule.includeTagIds.filter((id) => id !== tagId),
      },
    });
  }

  function handleSave() {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) {
      toast.error("Give the segment a name.");
      return;
    }
    if (editor.scope === "tags" && editor.rule.includeTagIds.length === 0) {
      toast.error("Pick at least one tag to include.");
      return;
    }
    if (editor.scope === "everyone" && editor.rule.excludeTagIds.length === 0) {
      toast.error("Pick at least one tag to exclude.");
      return;
    }
    const rule = buildEffectiveRule(editor);
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
        void refreshSegments();
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
    const exc = rule.excludeTagIds.map((id) => tagName.get(id) ?? "?").join(", ");
    if (rule.includeTagIds.length === 0) {
      return <>Everyone{exc ? ` except: ${exc}` : ""}</>;
    }
    return (
      <>
        Has {rule.match === "all" ? "all" : "any"} of: {inc}
        {exc ? ` · excluding: ${exc}` : ""}
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

            {/* Scope: start from tag-matched contacts, or everyone. */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Who to include
              </span>
              <div className="inline-flex w-fit gap-1 rounded-lg border border-border bg-background p-1">
                {(
                  [
                    { key: "tags", label: "Contacts with tags" },
                    { key: "everyone", label: "Everyone" },
                  ] as const
                ).map((option) => {
                  const active = editor.scope === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setScope(option.key)}
                      aria-pressed={active}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {editor.scope === "tags" ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-muted-foreground">Match</span>
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
                </div>
                <p className="text-xs text-muted-foreground">
                  {editor.rule.match === "all"
                    ? "Only contacts who have every tag you pick are included — the more tags, the narrower."
                    : "Contacts who have at least one of the tags you pick are included — the more tags, the wider."}
                </p>
                <TagPicker
                  label="Include these tags"
                  categories={categories}
                  tagsByCategory={tagsByCategory}
                  selected={editor.rule.includeTagIds}
                  tone="include"
                  onToggle={toggleIncludeTag}
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Starts with{" "}
                <span className="font-medium text-foreground">every contact</span>
                . Narrow it down by excluding tags below.
              </p>
            )}

            <TagPicker
              label={
                editor.scope === "everyone"
                  ? "Except anyone with these tags"
                  : "Exclude anyone with these tags (optional)"
              }
              categories={categories}
              tagsByCategory={tagsByCategory}
              selected={editor.rule.excludeTagIds}
              tone="exclude"
              onToggle={toggleExcludeTag}
            />

            <div className="text-xs text-muted-foreground">
              {!ruleTargetsSomeone(buildEffectiveRule(editor)) ? (
                editor.scope === "everyone" ? (
                  "Pick at least one tag to exclude."
                ) : (
                  "Pick at least one tag to include."
                )
              ) : isCounting ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" />
                  counting…
                </span>
              ) : (
                <>
                  Matches{" "}
                  <span className="font-medium text-foreground">
                    ~{liveCount ?? 0}
                  </span>{" "}
                  {liveCount === 1 ? "contact" : "contacts"} right now.
                </>
              )}
            </div>

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

      {loadError ? (
        <div className="flex flex-col gap-3 px-4 py-6">
          <p className="text-sm text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={reload}
            className="w-fit rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground"
          >
            Retry
          </button>
        </div>
      ) : segments === null ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading segments...
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
