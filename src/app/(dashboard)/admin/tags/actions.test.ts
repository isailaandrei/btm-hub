import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateTagCategory = vi.fn();
const mockUpdateTagCategory = vi.fn();
const mockDeleteTagCategory = vi.fn();
const mockCreateTag = vi.fn();
const mockUpdateTag = vi.fn();
const mockDeleteTag = vi.fn();

vi.mock("@/lib/data/contacts", () => ({
  createTagCategory: mockCreateTagCategory,
  updateTagCategory: mockUpdateTagCategory,
  deleteTagCategory: mockDeleteTagCategory,
  createTag: mockCreateTag,
  updateTag: mockUpdateTag,
  deleteTag: mockDeleteTag,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const {
  addCategory,
  editCategory,
  editTag,
  submitCategoryEditForm,
  submitCategoryForm,
  submitTagForm,
} = await import("./actions");

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("addCategory", () => {
  beforeEach(() => {
    mockCreateTagCategory.mockResolvedValue({});
  });

  it("trims the name and passes through valid colors", async () => {
    await addCategory("  Program Interest  ", "blue");
    expect(mockCreateTagCategory).toHaveBeenCalledWith("Program Interest", "blue");
  });

  it("rejects unknown colors", async () => {
    await expect(addCategory("Program Interest", "teal")).rejects.toThrow(
      "Invalid tag color",
    );
    expect(mockCreateTagCategory).not.toHaveBeenCalled();
  });
});

describe("editCategory", () => {
  beforeEach(() => {
    mockUpdateTagCategory.mockResolvedValue({});
  });

  it("validates category colors before calling updateTagCategory", async () => {
    await editCategory(VALID_UUID, { color: "pink" });
    expect(mockUpdateTagCategory).toHaveBeenCalledWith(
      VALID_UUID,
      {
        color: "pink",
      },
      undefined,
    );
  });

  it("passes expectedUpdatedAt through for conflict-aware edits", async () => {
    await editCategory(
      VALID_UUID,
      { name: "Program Interest" },
      { expectedUpdatedAt: "2024-01-01T00:00:00Z" },
    );
    expect(mockUpdateTagCategory).toHaveBeenCalledWith(
      VALID_UUID,
      { name: "Program Interest" },
      { expectedUpdatedAt: "2024-01-01T00:00:00Z" },
    );
  });

  it("rejects invalid category colors", async () => {
    await expect(editCategory(VALID_UUID, { color: "teal" })).rejects.toThrow(
      "Invalid tag color",
    );
    expect(mockUpdateTagCategory).not.toHaveBeenCalled();
  });
});

describe("editTag", () => {
  beforeEach(() => {
    mockUpdateTag.mockResolvedValue({});
  });

  it("passes expectedUpdatedAt through for conflict-aware tag edits", async () => {
    await editTag(
      VALID_UUID,
      "Early Interest",
      { expectedUpdatedAt: "2024-01-01T00:00:00Z" },
    );
    expect(mockUpdateTag).toHaveBeenCalledWith(
      VALID_UUID,
      "Early Interest",
      { expectedUpdatedAt: "2024-01-01T00:00:00Z" },
    );
  });
});

describe("submitCategoryForm", () => {
  beforeEach(() => {
    mockCreateTagCategory.mockResolvedValue({});
  });

  it("returns field errors without incrementing resetKey on invalid input", async () => {
    const formData = new FormData();
    formData.set("name", " ");
    formData.set("color", "blue");

    await expect(
      submitCategoryForm(
        { errors: null, message: null, success: false, resetKey: 2 },
        formData,
      ),
    ).resolves.toEqual({
      errors: { name: ["Category name is required"] },
      message: null,
      success: false,
      resetKey: 2,
    });
  });

  it("increments resetKey after a successful category create", async () => {
    const formData = new FormData();
    formData.set("name", "Program Interest");
    formData.set("color", "blue");

    await expect(
      submitCategoryForm(
        { errors: null, message: null, success: false, resetKey: 2 },
        formData,
      ),
    ).resolves.toEqual({
      errors: null,
      message: 'Category "Program Interest" created.',
      success: true,
      resetKey: 3,
    });
  });
});

describe("submitCategoryEditForm", () => {
  beforeEach(() => {
    mockUpdateTagCategory.mockResolvedValue({});
  });

  it("increments resetKey after a successful category edit", async () => {
    const formData = new FormData();
    formData.set("categoryId", VALID_UUID);
    formData.set("expectedUpdatedAt", "2024-01-01T00:00:00Z");
    formData.set("name", "Program Interest");
    formData.set("color", "pink");

    await expect(
      submitCategoryEditForm(
        { errors: null, message: null, success: false, resetKey: 4 },
        formData,
      ),
    ).resolves.toEqual({
      errors: null,
      message: 'Category "Program Interest" updated.',
      success: true,
      resetKey: 5,
    });
    expect(mockUpdateTagCategory).toHaveBeenCalledWith(
      VALID_UUID,
      { color: "pink", name: "Program Interest" },
      { expectedUpdatedAt: "2024-01-01T00:00:00Z" },
    );
  });
});

describe("submitTagForm", () => {
  beforeEach(() => {
    mockCreateTag.mockResolvedValue({});
  });

  it("returns field errors without incrementing resetKey on invalid input", async () => {
    const formData = new FormData();
    formData.set("categoryId", VALID_UUID);
    formData.set("name", " ");

    await expect(
      submitTagForm(
        { errors: null, message: null, success: false, resetKey: 5 },
        formData,
      ),
    ).resolves.toEqual({
      errors: { name: ["Tag name is required"] },
      message: null,
      success: false,
      resetKey: 5,
    });
  });

  it("increments resetKey after a successful tag create", async () => {
    const formData = new FormData();
    formData.set("categoryId", VALID_UUID);
    formData.set("name", "Early Interest");

    await expect(
      submitTagForm(
        { errors: null, message: null, success: false, resetKey: 5 },
        formData,
      ),
    ).resolves.toEqual({
      errors: null,
      message: 'Tag "Early Interest" added.',
      success: true,
      resetKey: 6,
    });
  });
});
