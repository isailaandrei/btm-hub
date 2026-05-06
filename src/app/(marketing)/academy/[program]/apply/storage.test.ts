import { describe, expect, it, vi } from "vitest";
import { readSavedApplicationForm } from "./storage";

describe("readSavedApplicationForm", () => {
  it("does not touch localStorage during server rendering", () => {
    const localStorageGetter = vi.fn(() => {
      throw new Error("localStorage should not be read on the server");
    });
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: localStorageGetter,
    });

    expect(readSavedApplicationForm("photography", "v1", 3)).toBeNull();
    expect(localStorageGetter).not.toHaveBeenCalled();

    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
    if (localStorageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it("returns saved data when the form version matches", () => {
    const saved = {
      formVersion: "v1",
      step: 2,
      answers: { name: "Alex" },
    };
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => JSON.stringify(saved)),
      },
    });

    expect(readSavedApplicationForm("photography", "v1", 3)).toEqual(saved);
    expect(globalThis.localStorage.getItem).toHaveBeenCalledWith(
      "btm-application-photography",
    );

    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
    if (localStorageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it("sanitizes malformed saved data before returning it", () => {
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() =>
          JSON.stringify({
            formVersion: "v1",
            step: 999,
            answers: ["not", "an", "object"],
          }),
        ),
      },
    });

    expect(readSavedApplicationForm("photography", "v1", 4)).toEqual({
      formVersion: "v1",
      step: 4,
      answers: {},
    });

    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
    if (localStorageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
