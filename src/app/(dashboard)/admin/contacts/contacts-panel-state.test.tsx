/**
 * @vitest-environment jsdom
 */

import {
  act,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Contact } from "@/types/database";
import { BUILTIN_COLUMN, type SortState } from "./sort-helpers";
import { useContactsPanelState } from "./contacts-panel-state";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("./actions", () => ({
  updatePreferences: vi.fn(),
}));

type ContactsPanelState = ReturnType<typeof useContactsPanelState>;

function installLocalStorageMock() {
  const storage = new Map<string, string>();

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
}

function StateHarness({
  onState,
}: {
  onState: (state: ContactsPanelState) => void;
}) {
  const state = useContactsPanelState({
    contacts: [] satisfies Contact[],
    ensureApplications: () => undefined,
    ensureContacts: () => undefined,
    ensurePreferences: () => undefined,
    preferences: {},
    setPreferences: vi.fn() as Dispatch<SetStateAction<Record<string, unknown>>>,
  });

  useEffect(() => {
    onState(state);
  }, [onState, state]);

  return (
    <>
      <button type="button" onClick={() => state.toggleSort(BUILTIN_COLUMN.name)}>
        Sort name
      </button>
      <button type="button" onClick={state.handleClearAllFilters}>
        Clear
      </button>
    </>
  );
}

describe("useContactsPanelState", () => {
  let root: Root;
  let container: HTMLDivElement;
  let latestState: ContactsPanelState | null;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    installLocalStorageMock();
    localStorage.clear();
    latestState = null;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
    localStorage.clear();
  });

  function renderHarness() {
    act(() => {
      root.render(<StateHarness onState={(state) => { latestState = state; }} />);
    });
  }

  function clickButton(label: string) {
    const button = [...container.querySelectorAll("button")].find(
      (element) => element.textContent === label,
    );
    if (!button) throw new Error(`Missing ${label} button`);

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("defaults to newest submitted contacts first", () => {
    renderHarness();

    expect(latestState?.sortBy).toEqual({
      key: BUILTIN_COLUMN.submittedAt,
      direction: "desc",
    } satisfies SortState);
  });

  it("resets clear all filters to newest submitted contacts first", () => {
    renderHarness();
    clickButton("Sort name");

    expect(latestState?.sortBy).toEqual({
      key: BUILTIN_COLUMN.name,
      direction: "asc",
    } satisfies SortState);

    clickButton("Clear");

    expect(latestState?.sortBy).toEqual({
      key: BUILTIN_COLUMN.submittedAt,
      direction: "desc",
    } satisfies SortState);
  });
});
