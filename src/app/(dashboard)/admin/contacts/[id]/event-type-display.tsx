import type { ContactEventType } from "@/types/database";
import {
  Clock,
  HelpCircle,
  MessageSquare,
  MoreHorizontal,
  Phone,
  StickyNote,
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
  custom: { icon: MoreHorizontal, colorClass: "bg-gray-500" },
};
