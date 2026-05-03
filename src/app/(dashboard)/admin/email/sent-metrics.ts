import type { EmailSend } from "@/types/database";

export type EmailSendMetricTone = "neutral" | "positive" | "warning" | "danger";

export interface EmailSendMetric {
  key: string;
  label: string;
  value: string;
  tone: EmailSendMetricTone;
}

export function buildEmailSendMetrics(send: EmailSend): EmailSendMetric[] {
  return [
    {
      key: "sent",
      label: "Sent",
      value: `${send.sent_count}/${send.recipient_count}`,
      tone: "neutral",
    },
    {
      key: "delivered",
      label: "Delivered",
      value: String(send.delivered_count),
      tone: "positive",
    },
    {
      key: "clicked",
      label: "Clicked",
      value: String(send.clicked_count),
      tone: send.clicked_count > 0 ? "positive" : "neutral",
    },
    {
      key: "bounced",
      label: "Bounced",
      value: String(send.bounced_count),
      tone: send.bounced_count > 0 ? "danger" : "neutral",
    },
    {
      key: "complained",
      label: "Complaints",
      value: String(send.complained_count),
      tone: send.complained_count > 0 ? "danger" : "neutral",
    },
    {
      key: "failed",
      label: "Failed",
      value: String(send.failed_count),
      tone: send.failed_count > 0 ? "danger" : "neutral",
    },
    {
      key: "skipped",
      label: "Skipped",
      value: String(send.skipped_count),
      tone: send.skipped_count > 0 ? "warning" : "neutral",
    },
    {
      key: "unsubscribed",
      label: "Unsubscribed",
      value: String(send.unsubscribed_count),
      tone: send.unsubscribed_count > 0 ? "warning" : "neutral",
    },
  ];
}
