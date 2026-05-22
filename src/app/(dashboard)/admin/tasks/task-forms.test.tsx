/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateTaskGroupForm } from "./task-forms";

vi.mock("./actions", () => ({
  createTaskAction: vi.fn(),
  createTaskCommentAction: vi.fn(),
  createTaskGroupAction: vi.fn(),
}));

describe("CreateTaskGroupForm", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("creates groups with a name only and no color control", () => {
    act(() => {
      root.render(<CreateTaskGroupForm onSuccess={vi.fn()} />);
    });

    const helperSlots = container.querySelectorAll("[data-task-form-helper]");
    expect(helperSlots).toHaveLength(1);
    helperSlots.forEach((slot) => {
      expect(slot.className).toContain("min-h-4");
    });

    expect(container.textContent).not.toContain("Color");
    expect(container.querySelector("select[name='color']")).toBeNull();

    const form = container.querySelector<HTMLFormElement>("form");
    expect(form?.className).toContain("max-content");
    expect(form?.className).toContain("sm:justify-start");

    const submit = container.querySelector<HTMLButtonElement>("button[type='submit']");
    expect(submit?.className).toContain("sm:mt-5");
    expect(submit?.className).toContain("justify-self-start");
  });
});
