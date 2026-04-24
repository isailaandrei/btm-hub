import { describe, it, expect } from "vitest";
import type { ContactEventSummary } from "@/lib/data/contact-events";
import type { Application } from "@/types/database";
import { deriveContactActivity } from "./events-derivation";

function event(partial: Partial<ContactEventSummary>): ContactEventSummary {
  return {
    contact_id: "contact-1",
    type: "note",
    custom_label: null,
    happened_at: "2026-04-22T10:00:00.000Z",
    resolved_at: null,
    ...partial,
  };
}

function application(submittedAt: string): Pick<Application, "submitted_at"> {
  return { submitted_at: submittedAt };
}

describe("deriveContactActivity", () => {
  it("returns empty state when there are neither events nor applications", () => {
    const result = deriveContactActivity([], []);
    expect(result).toEqual({
      last_activity_at: null,
      last_activity_label: null,
      awaiting_applicant: false,
      awaiting_btm: false,
    });
  });

  it("falls back to Application submitted when no events", () => {
    const apps = [application("2026-04-01T10:00:00.000Z")];
    const result = deriveContactActivity([], apps);
    expect(result).toEqual({
      last_activity_at: "2026-04-01T10:00:00.000Z",
      last_activity_label: "Application submitted",
      awaiting_applicant: false,
      awaiting_btm: false,
    });
  });

  it("uses the most recent application when multiple exist", () => {
    const apps = [
      application("2026-04-01T10:00:00.000Z"),
      application("2026-04-10T10:00:00.000Z"),
    ];
    const result = deriveContactActivity([], apps);
    expect(result.last_activity_at).toBe("2026-04-10T10:00:00.000Z");
  });

  it("prefers newest event over application submission", () => {
    const events = [event({ happened_at: "2026-04-20T10:00:00.000Z", type: "call" })];
    const apps = [application("2026-04-01T10:00:00.000Z")];
    const result = deriveContactActivity(events, apps);
    expect(result.last_activity_at).toBe("2026-04-20T10:00:00.000Z");
    expect(result.last_activity_label).toBe("Call");
  });

  it("labels custom events with their custom_label", () => {
    const events = [
      event({
        type: "custom",
        custom_label: "Intro with family",
        happened_at: "2026-04-20T10:00:00.000Z",
      }),
    ];
    const result = deriveContactActivity(events, []);
    expect(result.last_activity_label).toBe("Intro with family");
  });

  it("flags awaiting_applicant when info_requested is unresolved", () => {
    const events = [event({ type: "info_requested", resolved_at: null })];
    const result = deriveContactActivity(events, []);
    expect(result.awaiting_applicant).toBe(true);
    expect(result.awaiting_btm).toBe(false);
  });

  it("does not flag awaiting_applicant when info_requested is resolved", () => {
    const events = [
      event({
        type: "info_requested",
        resolved_at: "2026-04-21T10:00:00.000Z",
      }),
    ];
    const result = deriveContactActivity(events, []);
    expect(result.awaiting_applicant).toBe(false);
  });

  it("flags awaiting_btm when awaiting_btm_response is unresolved", () => {
    const events = [event({ type: "awaiting_btm_response", resolved_at: null })];
    const result = deriveContactActivity(events, []);
    expect(result.awaiting_btm).toBe(true);
  });

  it("flags both when both pending types are open", () => {
    const events = [
      event({ type: "info_requested", resolved_at: null }),
      event({ type: "awaiting_btm_response", resolved_at: null }),
    ];
    const result = deriveContactActivity(events, []);
    expect(result.awaiting_applicant).toBe(true);
    expect(result.awaiting_btm).toBe(true);
  });

  it("selects the label from the newest event, not the newest pending event", () => {
    const events = [
      event({
        type: "info_requested",
        resolved_at: null,
        happened_at: "2026-04-10T10:00:00.000Z",
      }),
      event({
        type: "note",
        happened_at: "2026-04-20T10:00:00.000Z",
      }),
    ];
    const result = deriveContactActivity(events, []);
    expect(result.last_activity_label).toBe("Note");
    expect(result.awaiting_applicant).toBe(true);
  });
});
