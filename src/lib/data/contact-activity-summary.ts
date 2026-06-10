import type { ContactEventType } from "@/types/database";

export interface ContactActivitySummary {
  contact_id: string;
  last_event_type: ContactEventType | null;
  last_event_custom_label: string | null;
  last_event_at: string | null;
  awaiting_applicant: boolean;
  awaiting_btm: boolean;
  latest_app_submitted_at: string | null;
}
