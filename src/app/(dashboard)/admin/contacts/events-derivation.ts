import type { Application } from "@/types/database";
import type { ContactEventSummary } from "@/lib/data/contact-events";
import { eventTypeLabel } from "./[id]/event-types";

export interface ContactActivityDerivation {
  last_activity_at: string | null;
  last_activity_label: string | null;
  awaiting_applicant: boolean;
  awaiting_btm: boolean;
}

export function deriveContactActivity(
  events: ContactEventSummary[],
  applications: Pick<Application, "submitted_at">[],
): ContactActivityDerivation {
  let newestEvent: ContactEventSummary | null = null;
  let awaiting_applicant = false;
  let awaiting_btm = false;

  for (const event of events) {
    if (!newestEvent || event.happened_at > newestEvent.happened_at) {
      newestEvent = event;
    }
    if (event.resolved_at === null) {
      if (event.type === "info_requested") awaiting_applicant = true;
      if (event.type === "awaiting_btm_response") awaiting_btm = true;
    }
  }

  if (newestEvent) {
    return {
      last_activity_at: newestEvent.happened_at,
      last_activity_label: eventTypeLabel(newestEvent.type, newestEvent.custom_label),
      awaiting_applicant,
      awaiting_btm,
    };
  }

  let newestApp: string | null = null;
  for (const app of applications) {
    if (!newestApp || app.submitted_at > newestApp) {
      newestApp = app.submitted_at;
    }
  }
  if (newestApp) {
    return {
      last_activity_at: newestApp,
      last_activity_label: "Application submitted",
      awaiting_applicant,
      awaiting_btm,
    };
  }

  return {
    last_activity_at: null,
    last_activity_label: null,
    awaiting_applicant,
    awaiting_btm,
  };
}
