import type { EmailSend } from "@/types/database";

export type EmailSendMetricTone = "neutral" | "positive" | "warning" | "danger";

export interface EmailSendMetric {
  key: string;
  label: string;
  value: string;
  tone: EmailSendMetricTone;
  /** Optional explanatory tooltip shown on hover (rendered as the chip title). */
  hint?: string;
}

function count(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function buildEmailSendMetrics(send: EmailSend): EmailSendMetric[] {
  const openedCount = count(send.opened_count);
  const proxyOpenedCount = count(send.proxy_opened_count);
  const clickedCount = count(send.clicked_count);
  const bouncedCount = count(send.bounced_count);
  const failedCount = count(send.failed_count);
  const notReceivedCount = bouncedCount + failedCount;
  const deferredCount = count(send.deferred_count);
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
      key: "opened",
      label: "Opened",
      value: String(openedCount),
      tone: openedCount > 0 ? "positive" : "neutral",
      hint:
        "Confirmed opens (includes clicks, which imply an open). Excludes privacy-proxy pre-fetches.",
    },
    // Optimistic upper bound: opens we only saw via a privacy proxy (Apple Mail
    // Privacy Protection et al.), where there's no confirmed open. Shown only
    // when present so the "Opened" chip stays the honest, certain number.
    ...(proxyOpenedCount > 0
      ? [
          {
            key: "proxy_opened",
            label: "Maybe opened",
            value: `+${proxyOpenedCount}`,
            tone: "neutral" as const,
            hint: `${proxyOpenedCount} more recipient(s) had the email pre-fetched by a privacy proxy (Apple Mail Privacy Protection). These may or may not be real opens — optimistic max is ${
              openedCount + proxyOpenedCount
            }.`,
          },
        ]
      : []),
    {
      key: "clicked",
      label: "Button clicked",
      value: String(clickedCount),
      tone: clickedCount > 0 ? "positive" : "neutral",
    },
    {
      key: "failed",
      label: "Failed",
      value: String(notReceivedCount),
      tone: notReceivedCount > 0 ? "danger" : "neutral",
    },
    {
      key: "deferred",
      label: "Deferred",
      value: String(deferredCount),
      tone: deferredCount > 0 ? "warning" : "neutral",
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
