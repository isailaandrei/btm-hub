import type { ContactEvent } from "@/types/database";
import { isEmailSentEvent } from "./event-type-display";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function deliveryLabelFor(metadata: Record<string, unknown>): string {
  const status = readString(metadata.delivery_status);
  if (status === "delivered") return "Delivered";
  if (status === "not_delivered") return "Not delivered";
  return "Not delivered yet";
}

export function timelineEventBody(event: ContactEvent): string {
  if (!isEmailSentEvent(event)) return event.body;

  const subject = readString(event.metadata.subject) ?? "Email";
  return `Subject: ${subject}\nDelivery: ${deliveryLabelFor(event.metadata)}`;
}
