import type { EmailSend } from "@/types/database";

export type EmailSendMetricTone = "neutral" | "positive" | "warning" | "danger";

export interface EmailSendMetric {
  key: string;
  label: string;
  value: string;
  tone: EmailSendMetricTone;
}

function count(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function buildEmailSendMetrics(send: EmailSend): EmailSendMetric[] {
  const clickedCount = count(send.clicked_count);
  const bouncedCount = count(send.bounced_count);
  const failedCount = count(send.failed_count);
  const skippedCount = count(send.skipped_count);
  const unsubscribedCount = count(send.unsubscribed_count);

  return [
    {
      key: "sent",
      label: "Sent",
      value: `${count(send.sent_count)}/${count(send.recipient_count)}`,
      tone: "neutral",
    },
    {
      key: "delivered",
      label: "Delivered",
      value: String(count(send.delivered_count)),
      tone: "positive",
    },
    {
      key: "clicked",
      label: "Clicked",
      value: String(clickedCount),
      tone: clickedCount > 0 ? "positive" : "neutral",
    },
    {
      key: "bounced",
      label: "Bounced",
      value: String(bouncedCount),
      tone: bouncedCount > 0 ? "danger" : "neutral",
    },
    {
      key: "failed",
      label: "Failed",
      value: String(failedCount),
      tone: failedCount > 0 ? "danger" : "neutral",
    },
    {
      key: "skipped",
      label: "Skipped",
      value: String(skippedCount),
      tone: skippedCount > 0 ? "warning" : "neutral",
    },
    {
      key: "unsubscribed",
      label: "Unsubscribed",
      value: String(unsubscribedCount),
      tone: unsubscribedCount > 0 ? "warning" : "neutral",
    },
  ];
}
