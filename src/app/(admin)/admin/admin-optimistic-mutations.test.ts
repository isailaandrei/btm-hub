import { describe, expect, it } from "vitest";
import type { ContactTag, Tag, TagCategory } from "@/types/database";
import {
  addMissingContactTags,
  patchCategoryById,
  patchTagById,
  removeCategoryById,
  removeContactTagPairs,
  removeExistingContactTags,
  removeTagById,
  restoreContactTags,
  upsertCategoryById,
  upsertContactTagByPair,
  upsertTagById,
} from "./admin-optimistic-mutations";

const assignedAt = "2026-06-01T10:00:00.000Z";

function contactTag(contactId: string, tagId: string): ContactTag {
  return { contact_id: contactId, tag_id: tagId, assigned_at: assignedAt };
}

function tag(overrides: Partial<Tag>): Tag {
  return {
    id: "tag-1",
    category_id: "category-1",
    name: "Active",
    sort_order: 1000,
    updated_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

function category(overrides: Partial<TagCategory>): TagCategory {
  return {
    id: "category-1",
    name: "Status",
    color: "blue",
    sort_order: 1000,
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("admin optimistic contact tag helpers", () => {
  it("adds only missing pairs and rolls those pairs back", () => {
    const existing = [contactTag("contact-1", "tag-1")];
    const { next, addedRows } = addMissingContactTags(
      existing,
      ["contact-1", "contact-2"],
      "tag-1",
      assignedAt,
    );

    expect(next).toHaveLength(2);
    expect(addedRows).toEqual([contactTag("contact-2", "tag-1")]);
    expect(removeContactTagPairs(next, addedRows)).toEqual(existing);
  });

  it("removes only existing pairs and restores those rows", () => {
    const existing = [
      contactTag("contact-1", "tag-1"),
      contactTag("contact-2", "tag-1"),
      contactTag("contact-3", "tag-2"),
    ];
    const { next, removedRows } = removeExistingContactTags(
      existing,
      ["contact-1", "contact-4"],
      "tag-1",
    );

    expect(next).toEqual([
      contactTag("contact-2", "tag-1"),
      contactTag("contact-3", "tag-2"),
    ]);
    expect(removedRows).toEqual([contactTag("contact-1", "tag-1")]);
    expect(restoreContactTags(next, removedRows)).toEqual([
      contactTag("contact-2", "tag-1"),
      contactTag("contact-3", "tag-2"),
      contactTag("contact-1", "tag-1"),
    ]);
  });

  it("upserts realtime contact_tags inserts by contact and tag", () => {
    const next = upsertContactTagByPair(
      [contactTag("contact-1", "tag-1")],
      {
        contact_id: "contact-1",
        tag_id: "tag-1",
        assigned_at: "2026-06-02T10:00:00.000Z",
      },
    );

    expect(next).toEqual([
      {
        contact_id: "contact-1",
        tag_id: "tag-1",
        assigned_at: "2026-06-02T10:00:00.000Z",
      },
    ]);
  });
});

describe("admin optimistic tag/category helpers", () => {
  it("updates and removes tags by id without replacing unrelated rows", () => {
    const first = tag({ id: "tag-1", name: "Active" });
    const second = tag({ id: "tag-2", name: "VIP" });

    expect(patchTagById([first, second], "tag-1", { name: "Alumni" })).toEqual([
      { ...first, name: "Alumni" },
      second,
    ]);
    expect(removeTagById([first, second], "tag-1")).toEqual([second]);
    expect(upsertTagById([first], second)).toEqual([first, second]);
  });

  it("updates, removes, and restores categories by id", () => {
    const first = category({ id: "category-1", name: "Status" });
    const second = category({ id: "category-2", name: "Program" });

    const patched = patchCategoryById([first, second], "category-1", {
      color: "green",
    });
    expect(patched.find((item) => item.id === "category-1")).toEqual({
      ...first,
      color: "green",
    });

    const removed = removeCategoryById(patched, "category-1");
    expect(removed).toEqual([second]);
    expect(upsertCategoryById(removed, first).map((item) => item.id)).toEqual([
      "category-2",
      "category-1",
    ]);
  });
});
