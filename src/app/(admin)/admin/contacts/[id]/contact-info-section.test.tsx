/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { ContactInfoField } from "@/types/database";
import type { ContactInfoValueRow } from "@/lib/data/contact-info";

const mockLoad = vi.fn();
const mockSetValue = vi.fn();
const mockCreateField = vi.fn();
const mockRemoveValue = vi.fn();

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("./contact-info-actions", () => ({
  loadContactInfoSection: mockLoad,
  setContactInfoValueAction: mockSetValue,
  createContactInfoFieldAction: mockCreateField,
  removeContactInfoValueAction: mockRemoveValue,
}));

const { ContactInfoSection } = await import("./contact-info-section");

const CONTACT_ID = "550e8400-e29b-41d4-a716-446655440001";

// sort_order deliberately not in name order: Insurance < Address < Rashguard.
const FIELD_INSURANCE: ContactInfoField = {
  id: "550e8400-e29b-41d4-a716-446655440102",
  name: "Insurance number",
  sort_order: 1000,
  created_at: "2026-01-01T00:00:00.000Z",
};
const FIELD_ADDRESS: ContactInfoField = {
  id: "550e8400-e29b-41d4-a716-446655440101",
  name: "Address",
  sort_order: 2000,
  created_at: "2026-01-01T00:00:00.000Z",
};
const FIELD_RASHGUARD: ContactInfoField = {
  id: "550e8400-e29b-41d4-a716-446655440103",
  name: "Rashguard size",
  sort_order: 3000,
  created_at: "2026-01-01T00:00:00.000Z",
};

function makeRow(field: ContactInfoField, value: string): ContactInfoValueRow {
  return {
    field_id: field.id,
    value,
    updated_at: "2026-01-01T00:00:00.000Z",
    contact_info_fields: {
      id: field.id,
      name: field.name,
      sort_order: field.sort_order,
    },
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressKey(el: Element, key: string) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

function click(el: Element) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function findButton(text: string, scope: ParentNode = document.body) {
  const button = [...scope.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

function popoverContent(): HTMLElement {
  const el = document.body.querySelector<HTMLElement>(
    '[data-slot="popover-content"]',
  );
  if (!el) throw new Error("Popover content not found — is it open?");
  return el;
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function openAddPopover() {
  await act(async () => {
    click(findButton("+ Info"));
  });
  await flushAsyncWork();
}

describe("ContactInfoSection", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockLoad.mockReset();
    mockSetValue.mockReset().mockResolvedValue(undefined);
    mockCreateField.mockReset();
    mockRemoveValue.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders pairs sorted by the embedded field sort_order, not input array order", async () => {
    await act(async () => {
      root.render(
        <ContactInfoSection
          contactId={CONTACT_ID}
          initialData={{
            fields: [FIELD_RASHGUARD, FIELD_ADDRESS, FIELD_INSURANCE],
            // Deliberately out of sort_order order.
            values: [makeRow(FIELD_ADDRESS, "123 Ocean Ave"), makeRow(FIELD_INSURANCE, "INS-001")],
          }}
        />,
      );
    });
    await flushAsyncWork();

    expect(mockLoad).not.toHaveBeenCalled();
    const text = container.textContent ?? "";
    expect(text).toContain("123 Ocean Ave");
    expect(text).toContain("INS-001");
    expect(text.indexOf("Insurance number")).toBeLessThan(text.indexOf("Address"));
  });

  it("renders just the add button when there are no values", async () => {
    await act(async () => {
      root.render(
        <ContactInfoSection
          contactId={CONTACT_ID}
          initialData={{ fields: [FIELD_ADDRESS], values: [] }}
        />,
      );
    });
    await flushAsyncWork();

    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-label")).toBe("Add contact info field");
    expect(container.textContent).not.toContain("Address");
  });

  it("lazy-loads when initialData is not provided, showing shimmer chips first", async () => {
    let resolveLoad!: (value: { fields: ContactInfoField[]; values: ContactInfoValueRow[] }) => void;
    mockLoad.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );

    await act(async () => {
      root.render(<ContactInfoSection contactId={CONTACT_ID} />);
    });

    expect(mockLoad).toHaveBeenCalledWith(CONTACT_ID);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(2);

    await act(async () => {
      resolveLoad({ fields: [FIELD_ADDRESS], values: [makeRow(FIELD_ADDRESS, "123 Ocean Ave")] });
    });
    await flushAsyncWork();

    expect(container.textContent).toContain("123 Ocean Ave");
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
  });

  it("surfaces a load error with a retry that reloads", async () => {
    mockLoad
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        fields: [FIELD_ADDRESS],
        values: [makeRow(FIELD_ADDRESS, "123 Ocean Ave")],
      });

    await act(async () => {
      root.render(<ContactInfoSection contactId={CONTACT_ID} />);
    });
    await flushAsyncWork();

    expect(container.textContent).toContain("boom");
    const retryButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Retry",
    );
    if (!retryButton) throw new Error("Missing Retry button");

    await act(async () => {
      click(retryButton);
    });
    await flushAsyncWork();

    expect(mockLoad).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("123 Ocean Ave");
  });

  it("the add-field picker lists only fields not yet set on this contact", async () => {
    await act(async () => {
      root.render(
        <ContactInfoSection
          contactId={CONTACT_ID}
          initialData={{
            fields: [FIELD_ADDRESS, FIELD_INSURANCE, FIELD_RASHGUARD],
            values: [makeRow(FIELD_ADDRESS, "123 Ocean Ave"), makeRow(FIELD_INSURANCE, "INS-001")],
          }}
        />,
      );
    });
    await flushAsyncWork();

    await openAddPopover();

    const content = popoverContent();
    const fieldButtonLabels = [...content.querySelectorAll("button")].map(
      (button) => button.textContent?.trim(),
    );
    expect(fieldButtonLabels).toContain("Rashguard size");
    expect(fieldButtonLabels).not.toContain("Address");
    expect(fieldButtonLabels).not.toContain("Insurance number");
  });

  it("typing in the picker filters the field list by name", async () => {
    await act(async () => {
      root.render(
        <ContactInfoSection
          contactId={CONTACT_ID}
          initialData={{
            fields: [FIELD_ADDRESS, FIELD_INSURANCE, FIELD_RASHGUARD],
            values: [],
          }}
        />,
      );
    });
    await flushAsyncWork();
    await openAddPopover();

    let content = popoverContent();
    expect(
      [...content.querySelectorAll("button")].map((b) => b.textContent?.trim()),
    ).toEqual(expect.arrayContaining(["Address", "Insurance number", "Rashguard size"]));

    const filterInput = content.querySelector<HTMLInputElement>(
      'input[placeholder="Search or create a field..."]',
    );
    if (!filterInput) throw new Error("Missing filter input");

    await act(async () => {
      setInputValue(filterInput, "ins");
    });

    content = popoverContent();
    const labelsAfterFilter = [...content.querySelectorAll("button")]
      .map((b) => b.textContent?.trim())
      .filter((label) => label && !label.startsWith("Create "));
    expect(labelsAfterFilter).toEqual(["Insurance number"]);
  });

  it("shows a Create entry for text matching no unset field, and hides it on an exact match", async () => {
    await act(async () => {
      root.render(
        <ContactInfoSection
          contactId={CONTACT_ID}
          initialData={{ fields: [FIELD_RASHGUARD], values: [] }}
        />,
      );
    });
    await flushAsyncWork();
    await openAddPopover();

    const filterInput = popoverContent().querySelector<HTMLInputElement>(
      'input[placeholder="Search or create a field..."]',
    );
    if (!filterInput) throw new Error("Missing filter input");

    await act(async () => {
      setInputValue(filterInput, "Wetsuit size");
    });
    expect(popoverContent().textContent).toContain('Create "Wetsuit size"');

    await act(async () => {
      // Case-insensitive exact match of the one unset field — no create offer.
      setInputValue(filterInput, "rashguard size");
    });
    expect(popoverContent().textContent).not.toContain("Create ");
  });

  it("selecting an existing field, submitting a value, adds it optimistically, calls the action, and re-reads into onDataLoaded", async () => {
    let resolveSet!: () => void;
    mockSetValue.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSet = resolve;
      }),
    );
    const reReadResult = {
      fields: [FIELD_ADDRESS, FIELD_RASHGUARD],
      values: [makeRow(FIELD_ADDRESS, "123 Ocean Ave"), makeRow(FIELD_RASHGUARD, "L")],
    };
    mockLoad.mockResolvedValueOnce(reReadResult);
    const onDataLoaded = vi.fn();

    await act(async () => {
      root.render(
        <ContactInfoSection
          contactId={CONTACT_ID}
          initialData={{
            fields: [FIELD_ADDRESS, FIELD_RASHGUARD],
            values: [makeRow(FIELD_ADDRESS, "123 Ocean Ave")],
          }}
          onDataLoaded={onDataLoaded}
        />,
      );
    });
    await flushAsyncWork();
    await openAddPopover();

    await act(async () => {
      click(findButton("Rashguard size", popoverContent()));
    });

    const valueInput = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Value"]',
    );
    if (!valueInput) throw new Error("Missing value input");

    await act(async () => {
      setInputValue(valueInput, "L");
      pressKey(valueInput, "Enter");
    });

    // Optimistic: rendered before the mutation resolves.
    expect(container.textContent).toContain("L");
    expect(mockLoad).not.toHaveBeenCalled();

    await act(async () => {
      resolveSet();
    });
    await flushAsyncWork();

    expect(mockSetValue).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      fieldId: FIELD_RASHGUARD.id,
      value: "L",
    });
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(onDataLoaded).toHaveBeenCalledWith(reReadResult);
  });

  it("creating a new field keys the pair by the field id the server returns", async () => {
    const createdField: ContactInfoField = {
      id: "550e8400-e29b-41d4-a716-446655440199",
      name: "Wetsuit size",
      sort_order: 4000,
      created_at: "2026-01-02T00:00:00.000Z",
    };
    let resolveCreate!: (field: ContactInfoField) => void;
    mockCreateField.mockReturnValue(
      new Promise<ContactInfoField>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const reReadResult = {
      fields: [FIELD_ADDRESS, createdField],
      values: [makeRow(FIELD_ADDRESS, "123 Ocean Ave"), makeRow(createdField, "M")],
    };
    mockLoad.mockResolvedValueOnce(reReadResult);
    const onDataLoaded = vi.fn();

    await act(async () => {
      root.render(
        <ContactInfoSection
          contactId={CONTACT_ID}
          initialData={{
            fields: [FIELD_ADDRESS],
            values: [makeRow(FIELD_ADDRESS, "123 Ocean Ave")],
          }}
          onDataLoaded={onDataLoaded}
        />,
      );
    });
    await flushAsyncWork();
    await openAddPopover();

    const filterInput = popoverContent().querySelector<HTMLInputElement>(
      'input[placeholder="Search or create a field..."]',
    );
    if (!filterInput) throw new Error("Missing filter input");

    await act(async () => {
      setInputValue(filterInput, "Wetsuit size");
    });
    await act(async () => {
      click(findButton('Create "Wetsuit size"', popoverContent()));
    });

    const valueInput = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Value"]',
    );
    if (!valueInput) throw new Error("Missing value input");

    await act(async () => {
      setInputValue(valueInput, "M");
      pressKey(valueInput, "Enter");
    });

    await act(async () => {
      resolveCreate(createdField);
    });
    await flushAsyncWork();

    expect(mockCreateField).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      name: "Wetsuit size",
      value: "M",
    });
    expect(container.textContent).toContain("Wetsuit size");
    expect(container.textContent).toContain("M");
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(onDataLoaded).toHaveBeenCalledWith(reReadResult);
  });

  it("edit save: Enter commits the new value, applies it optimistically, and re-reads", async () => {
    let resolveSet!: () => void;
    mockSetValue.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSet = resolve;
      }),
    );
    const reReadResult = {
      fields: [FIELD_ADDRESS],
      values: [makeRow(FIELD_ADDRESS, "New Addr")],
    };
    mockLoad.mockResolvedValueOnce(reReadResult);
    const onDataLoaded = vi.fn();

    await act(async () => {
      root.render(
        <ContactInfoSection
          contactId={CONTACT_ID}
          initialData={{
            fields: [FIELD_ADDRESS],
            values: [makeRow(FIELD_ADDRESS, "Old Addr")],
          }}
          onDataLoaded={onDataLoaded}
        />,
      );
    });
    await flushAsyncWork();

    await act(async () => {
      click(findButton("Old Addr", container));
    });

    const editInput = [...container.querySelectorAll("input")][0];
    expect(editInput).toBeTruthy();
    expect(editInput.value).toBe("Old Addr");

    await act(async () => {
      setInputValue(editInput, "New Addr");
      pressKey(editInput, "Enter");
    });

    // Optimistic before the mutation settles.
    expect(container.textContent).toContain("New Addr");
    expect(mockLoad).not.toHaveBeenCalled();

    await act(async () => {
      resolveSet();
    });
    await flushAsyncWork();

    expect(mockSetValue).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      fieldId: FIELD_ADDRESS.id,
      value: "New Addr",
    });
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(onDataLoaded).toHaveBeenCalledWith(reReadResult);
  });

  it("edit escape: reverts the draft without calling the action", async () => {
    await act(async () => {
      root.render(
        <ContactInfoSection
          contactId={CONTACT_ID}
          initialData={{
            fields: [FIELD_ADDRESS],
            values: [makeRow(FIELD_ADDRESS, "Old Addr")],
          }}
        />,
      );
    });
    await flushAsyncWork();

    await act(async () => {
      click(findButton("Old Addr", container));
    });

    const editInput = [...container.querySelectorAll("input")][0];
    await act(async () => {
      setInputValue(editInput, "Discarded edit");
      pressKey(editInput, "Escape");
    });
    await flushAsyncWork();

    expect(container.textContent).toContain("Old Addr");
    expect(container.textContent).not.toContain("Discarded edit");
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(mockSetValue).not.toHaveBeenCalled();
  });

  it("committing an unchanged or empty value is a no-op", async () => {
    await act(async () => {
      root.render(
        <ContactInfoSection
          contactId={CONTACT_ID}
          initialData={{
            fields: [FIELD_ADDRESS],
            values: [makeRow(FIELD_ADDRESS, "Old Addr")],
          }}
        />,
      );
    });
    await flushAsyncWork();

    // Unchanged commit.
    await act(async () => {
      click(findButton("Old Addr", container));
    });
    let editInput = [...container.querySelectorAll("input")][0];
    await act(async () => {
      pressKey(editInput, "Enter");
    });
    await flushAsyncWork();
    expect(container.textContent).toContain("Old Addr");
    expect(mockSetValue).not.toHaveBeenCalled();

    // Empty commit.
    await act(async () => {
      click(findButton("Old Addr", container));
    });
    editInput = [...container.querySelectorAll("input")][0];
    await act(async () => {
      setInputValue(editInput, "   ");
      pressKey(editInput, "Enter");
    });
    await flushAsyncWork();
    expect(container.textContent).toContain("Old Addr");
    expect(mockSetValue).not.toHaveBeenCalled();
  });

  it("a failed edit rolls back to the exact prior value and surfaces a toast", async () => {
    mockSetValue.mockRejectedValueOnce(new Error("nope"));

    await act(async () => {
      root.render(
        <ContactInfoSection
          contactId={CONTACT_ID}
          initialData={{
            fields: [FIELD_ADDRESS],
            values: [makeRow(FIELD_ADDRESS, "Old Addr")],
          }}
        />,
      );
    });
    await flushAsyncWork();

    await act(async () => {
      click(findButton("Old Addr", container));
    });
    const editInput = [...container.querySelectorAll("input")][0];
    await act(async () => {
      setInputValue(editInput, "Bad Addr");
      pressKey(editInput, "Enter");
    });
    await flushAsyncWork();

    expect(mockSetValue).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      fieldId: FIELD_ADDRESS.id,
      value: "Bad Addr",
    });
    expect(container.textContent).toContain("Old Addr");
    expect(container.textContent).not.toContain("Bad Addr");
    expect(vi.mocked(toast.error)).toHaveBeenCalled();
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("removing a value calls the remove action and drops the pair optimistically", async () => {
    let resolveRemove!: () => void;
    mockRemoveValue.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRemove = resolve;
      }),
    );
    mockLoad.mockResolvedValueOnce({
      fields: [FIELD_INSURANCE],
      values: [makeRow(FIELD_INSURANCE, "INS-001")],
    });

    await act(async () => {
      root.render(
        <ContactInfoSection
          contactId={CONTACT_ID}
          initialData={{
            fields: [FIELD_ADDRESS, FIELD_INSURANCE],
            values: [makeRow(FIELD_ADDRESS, "Old Addr"), makeRow(FIELD_INSURANCE, "INS-001")],
          }}
        />,
      );
    });
    await flushAsyncWork();

    await act(async () => {
      click(findButton("Old Addr", container));
    });

    const removeButton = [...container.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === "Remove Address",
    );
    if (!removeButton) throw new Error("Missing Remove button");

    await act(async () => {
      click(removeButton);
    });

    // Optimistic removal before the mutation settles.
    expect(container.textContent).not.toContain("Old Addr");
    expect(container.textContent).toContain("INS-001");
    expect(mockLoad).not.toHaveBeenCalled();

    await act(async () => {
      resolveRemove();
    });
    await flushAsyncWork();

    expect(mockRemoveValue).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      fieldId: FIELD_ADDRESS.id,
    });
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });
});
