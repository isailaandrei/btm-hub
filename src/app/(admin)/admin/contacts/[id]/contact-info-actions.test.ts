import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdmin,
  getContactInfoFields,
  getContactInfoValues,
  setContactInfoValue,
  createContactInfoFieldWithValue,
  removeContactInfoValue,
} = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getContactInfoFields: vi.fn(),
  getContactInfoValues: vi.fn(),
  setContactInfoValue: vi.fn(),
  createContactInfoFieldWithValue: vi.fn(),
  removeContactInfoValue: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin }));
vi.mock("@/lib/data/contact-info", () => ({
  getContactInfoFields,
  getContactInfoValues,
  setContactInfoValue,
  createContactInfoFieldWithValue,
  removeContactInfoValue,
}));

import {
  createContactInfoFieldAction,
  loadContactInfoSection,
  removeContactInfoValueAction,
  setContactInfoValueAction,
} from "./contact-info-actions";

const CONTACT_ID = "a0000000-0000-0000-0000-000000000000";
const FIELD_ID = "b0000000-0000-0000-0000-000000000000";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ role: "admin" });
});

describe("loadContactInfoSection", () => {
  it("rejects an invalid contact id before touching auth or data", async () => {
    await expect(loadContactInfoSection("not-a-uuid")).rejects.toThrow(
      /Invalid contact ID/,
    );
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(getContactInfoFields).not.toHaveBeenCalled();
    expect(getContactInfoValues).not.toHaveBeenCalled();
  });

  it("enforces admin and returns fields and values", async () => {
    const fields = [
      { id: FIELD_ID, name: "Address", sort_order: 0, created_at: "2026-05-01T00:00:00.000Z" },
    ];
    const values = [
      {
        field_id: FIELD_ID,
        value: "123 Ocean Ave",
        updated_at: "2026-05-01T00:00:00.000Z",
        contact_info_fields: { id: FIELD_ID, name: "Address", sort_order: 0 },
      },
    ];
    getContactInfoFields.mockResolvedValue(fields);
    getContactInfoValues.mockResolvedValue(values);

    const result = await loadContactInfoSection(CONTACT_ID);

    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(getContactInfoValues).toHaveBeenCalledWith(CONTACT_ID);
    expect(result).toEqual({ fields, values });
  });
});

describe("setContactInfoValueAction", () => {
  it("rejects an invalid contact id", async () => {
    await expect(
      setContactInfoValueAction({ contactId: "nope", fieldId: FIELD_ID, value: "x" }),
    ).rejects.toThrow(/Invalid contact ID/);
    expect(setContactInfoValue).not.toHaveBeenCalled();
  });

  it("rejects an invalid field id", async () => {
    await expect(
      setContactInfoValueAction({ contactId: CONTACT_ID, fieldId: "nope", value: "x" }),
    ).rejects.toThrow(/Invalid field ID/);
    expect(setContactInfoValue).not.toHaveBeenCalled();
  });

  it("rejects an empty (whitespace-only) value", async () => {
    await expect(
      setContactInfoValueAction({ contactId: CONTACT_ID, fieldId: FIELD_ID, value: "   " }),
    ).rejects.toThrow(/Value is required/);
    expect(setContactInfoValue).not.toHaveBeenCalled();
  });

  it("rejects a value over 2000 characters", async () => {
    await expect(
      setContactInfoValueAction({
        contactId: CONTACT_ID,
        fieldId: FIELD_ID,
        value: "a".repeat(2001),
      }),
    ).rejects.toThrow(/2000 characters/);
    expect(setContactInfoValue).not.toHaveBeenCalled();
  });

  it("delegates with the trimmed value", async () => {
    await setContactInfoValueAction({
      contactId: CONTACT_ID,
      fieldId: FIELD_ID,
      value: "  123 Ocean Ave  ",
    });

    expect(setContactInfoValue).toHaveBeenCalledWith(
      CONTACT_ID,
      FIELD_ID,
      "123 Ocean Ave",
    );
  });
});

describe("createContactInfoFieldAction", () => {
  it("rejects an invalid contact id", async () => {
    await expect(
      createContactInfoFieldAction({ contactId: "nope", name: "Address", value: "x" }),
    ).rejects.toThrow(/Invalid contact ID/);
    expect(createContactInfoFieldWithValue).not.toHaveBeenCalled();
  });

  it("rejects an empty (whitespace-only) name", async () => {
    await expect(
      createContactInfoFieldAction({ contactId: CONTACT_ID, name: "   ", value: "x" }),
    ).rejects.toThrow(/Field name is required/);
    expect(createContactInfoFieldWithValue).not.toHaveBeenCalled();
  });

  it("rejects a name over 80 characters", async () => {
    await expect(
      createContactInfoFieldAction({
        contactId: CONTACT_ID,
        name: "a".repeat(81),
        value: "x",
      }),
    ).rejects.toThrow(/80 characters/);
    expect(createContactInfoFieldWithValue).not.toHaveBeenCalled();
  });

  it("rejects an empty (whitespace-only) value", async () => {
    await expect(
      createContactInfoFieldAction({ contactId: CONTACT_ID, name: "Address", value: "  " }),
    ).rejects.toThrow(/Value is required/);
    expect(createContactInfoFieldWithValue).not.toHaveBeenCalled();
  });

  it("delegates with trimmed name and value, returning the created field", async () => {
    const field = {
      id: FIELD_ID,
      name: "Address",
      sort_order: 0,
      created_at: "2026-05-01T00:00:00.000Z",
    };
    createContactInfoFieldWithValue.mockResolvedValue(field);

    const result = await createContactInfoFieldAction({
      contactId: CONTACT_ID,
      name: "  Address  ",
      value: "  123 Ocean Ave  ",
    });

    expect(createContactInfoFieldWithValue).toHaveBeenCalledWith(
      CONTACT_ID,
      "Address",
      "123 Ocean Ave",
    );
    expect(result).toBe(field);
  });
});

describe("removeContactInfoValueAction", () => {
  it("rejects an invalid contact id", async () => {
    await expect(
      removeContactInfoValueAction({ contactId: "nope", fieldId: FIELD_ID }),
    ).rejects.toThrow(/Invalid contact ID/);
    expect(removeContactInfoValue).not.toHaveBeenCalled();
  });

  it("rejects an invalid field id", async () => {
    await expect(
      removeContactInfoValueAction({ contactId: CONTACT_ID, fieldId: "nope" }),
    ).rejects.toThrow(/Invalid field ID/);
    expect(removeContactInfoValue).not.toHaveBeenCalled();
  });

  it("delegates to removeContactInfoValue", async () => {
    await removeContactInfoValueAction({ contactId: CONTACT_ID, fieldId: FIELD_ID });
    expect(removeContactInfoValue).toHaveBeenCalledWith(CONTACT_ID, FIELD_ID);
  });
});
