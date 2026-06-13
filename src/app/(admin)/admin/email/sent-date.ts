import type { EmailSendStatus } from "@/types/database";

export function formatSentOnDate(
  value: string | null,
  options: {
    locale?: string;
    timeZone?: string;
  } = {},
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const dateText = new Intl.DateTimeFormat(options.locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: options.timeZone,
  }).format(date);
  const timeText = new Intl.DateTimeFormat(options.locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: options.timeZone,
  })
    .format(date)
    .toLowerCase();

  return `Sent on ${dateText} at ${timeText}`;
}

function formatDateTime(
  value: string | null,
  options: {
    locale?: string;
    timeZone?: string;
  } = {},
): { dateText: string; timeText: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const dateText = new Intl.DateTimeFormat(options.locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: options.timeZone,
  }).format(date);
  const timeText = new Intl.DateTimeFormat(options.locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: options.timeZone,
  })
    .format(date)
    .toLowerCase();

  return { dateText, timeText };
}

function formatDateWithPrefix(
  prefix: string,
  value: string | null,
  options: {
    locale?: string;
    timeZone?: string;
  } = {},
): string | null {
  const formatted = formatDateTime(value, options);
  if (!formatted) return null;
  return `${prefix} ${formatted.dateText} at ${formatted.timeText}`;
}

function timingPrefixForStatus(status: EmailSendStatus): string {
  if (status === "queued") return "Queued on";
  if (status === "sending") return "Sending since";
  if (status === "failed" || status === "partially_failed") return "Failed on";
  if (status === "draft") return "Created on";
  return "Sent on";
}

export function formatEmailSendTiming(
  send: {
    status: EmailSendStatus;
    confirmed_at: string | null;
    created_at: string;
  },
  options: {
    locale?: string;
    timeZone?: string;
  } = {},
): string | null {
  return formatDateWithPrefix(
    timingPrefixForStatus(send.status),
    send.confirmed_at ?? send.created_at,
    options,
  );
}
