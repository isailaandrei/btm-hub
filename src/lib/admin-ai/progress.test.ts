import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpsert = vi.fn();
const mockDeleteEq = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockResolvedValue({
    from: vi.fn(() => ({
      upsert: mockUpsert,
      delete: vi.fn(() => ({ eq: mockDeleteEq })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle })),
      })),
    })),
  }),
}));

import {
  createAdminAiProgressReporter,
  readAdminAiProgress,
} from "./progress";

const PROGRESS_ID = "22222222-2222-4222-8222-222222222222";

describe("createAdminAiProgressReporter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
    mockDeleteEq.mockResolvedValue({ error: null });
  });

  it("upserts snapshots in call order (serialized writes)", async () => {
    const reporter = createAdminAiProgressReporter(PROGRESS_ID);
    reporter.report({ stage: "planning" });
    reporter.report({ stage: "scanning", chunksDone: 1, chunkTotal: 4 });
    await reporter.clear();

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockUpsert.mock.calls[0]![0][0].snapshot).toEqual({
      stage: "planning",
    });
    expect(mockUpsert.mock.calls[1]![0][0].snapshot).toEqual({
      stage: "scanning",
      chunksDone: 1,
      chunkTotal: 4,
    });
    expect(mockDeleteEq).toHaveBeenCalledWith("id", PROGRESS_ID);
  });

  it("never throws into the pipeline when writes fail", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockUpsert.mockResolvedValue({ error: { message: "db down" } });
    mockDeleteEq.mockResolvedValue({ error: { message: "db down" } });

    const reporter = createAdminAiProgressReporter(PROGRESS_ID);
    expect(() => reporter.report({ stage: "planning" })).not.toThrow();
    await expect(reporter.clear()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("readAdminAiProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the snapshot merged with its timestamp", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        snapshot: { stage: "analyzing", candidateCount: 12 },
        updated_at: "2026-07-07T12:00:00.000Z",
      },
      error: null,
    });
    await expect(readAdminAiProgress(PROGRESS_ID)).resolves.toEqual({
      stage: "analyzing",
      candidateCount: 12,
      updatedAt: "2026-07-07T12:00:00.000Z",
    });
  });

  it("returns null when no row exists", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(readAdminAiProgress(PROGRESS_ID)).resolves.toBeNull();
  });

  it("fails loud on read errors", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    await expect(readAdminAiProgress(PROGRESS_ID)).rejects.toThrow(/boom/);
  });
});
