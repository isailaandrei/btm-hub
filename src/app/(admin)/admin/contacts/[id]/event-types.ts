import type { ContactEventType } from "@/types/database";

export interface EventTypeMeta {
  value: ContactEventType;
  label: string;
  bodyRequired: boolean;
  resolvable: boolean;
}

export const EVENT_TYPE_ORDER: ContactEventType[] = [
  "note",
  "call",
  "in_person_meeting",
  "message",
  "info_requested",
  "awaiting_btm_response",
  "custom",
];

export const EVENT_TYPE_META: Record<ContactEventType, EventTypeMeta> = {
  note: { value: "note", label: "Note", bodyRequired: true, resolvable: false },
  call: { value: "call", label: "Call", bodyRequired: false, resolvable: false },
  in_person_meeting: {
    value: "in_person_meeting",
    label: "In-person meeting",
    bodyRequired: false,
    resolvable: false,
  },
  message: { value: "message", label: "Message", bodyRequired: false, resolvable: false },
  info_requested: {
    value: "info_requested",
    label: "Info requested",
    bodyRequired: false,
    resolvable: true,
  },
  awaiting_btm_response: {
    value: "awaiting_btm_response",
    label: "Waiting for BTM response",
    bodyRequired: false,
    resolvable: true,
  },
  tag_assigned: {
    value: "tag_assigned",
    label: "Tag assigned",
    bodyRequired: false,
    resolvable: false,
  },
  custom: { value: "custom", label: "Custom", bodyRequired: false, resolvable: false },
};

export function eventTypeLabel(type: ContactEventType, customLabel: string | null): string {
  if (type === "custom") return customLabel ?? "Custom";
  return EVENT_TYPE_META[type].label;
}

export function isResolvable(type: ContactEventType): boolean {
  return EVENT_TYPE_META[type].resolvable;
}

export function bodyRequiredFor(type: ContactEventType): boolean {
  return EVENT_TYPE_META[type].bodyRequired;
}
