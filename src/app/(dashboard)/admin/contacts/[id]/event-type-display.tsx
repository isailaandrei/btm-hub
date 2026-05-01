import type { ContactEvent, ContactEventType } from "@/types/database";
import {
  Clock,
  HelpCircle,
  MessageSquare,
  MoreHorizontal,
  Phone,
  StickyNote,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

interface EventTypeDisplay {
  icon: LucideIcon;
  colorClass: string;
}

export const EVENT_TYPE_DISPLAY: Record<ContactEventType, EventTypeDisplay> = {
  note: { icon: StickyNote, colorClass: "bg-indigo-500" },
  call: { icon: Phone, colorClass: "bg-emerald-600" },
  in_person_meeting: { icon: Users, colorClass: "bg-cyan-600" },
  message: { icon: MessageSquare, colorClass: "bg-violet-600" },
  info_requested: { icon: HelpCircle, colorClass: "bg-amber-500" },
  awaiting_btm_response: { icon: Clock, colorClass: "bg-red-600" },
  tag_assigned: { icon: Tag, colorClass: "bg-sky-600" },
  custom: { icon: MoreHorizontal, colorClass: "bg-gray-500" },
};

type EventDisplayInput = Pick<ContactEvent, "type" | "metadata">;

export function isTagAssignmentEvent(event: EventDisplayInput): boolean {
  if (event.type === "tag_assigned") return true;

  const source = event.metadata?.source;
  return source === "contact_tags" || source === "contact_tags_backfill";
}

export function eventTypeDisplayFor(event: EventDisplayInput): EventTypeDisplay {
  if (isTagAssignmentEvent(event)) return EVENT_TYPE_DISPLAY.tag_assigned;
  return EVENT_TYPE_DISPLAY[event.type];
}
