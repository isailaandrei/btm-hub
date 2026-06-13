export type TaskDateBucket =
  | "past"
  | "today"
  | "tomorrow"
  | "this_week"
  | "next_week"
  | "later"
  | "without_date";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateOnly(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function daysBetween(left: string, right: string): number {
  return Math.round((parseDateOnly(left) - parseDateOnly(right)) / MS_PER_DAY);
}

function isoWeekday(dateValue: string): number {
  const day = new Date(parseDateOnly(dateValue)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function getTaskDateBucket(
  dueDate: string | null,
  today: string,
): TaskDateBucket {
  if (!dueDate) return "without_date";

  const diffDays = daysBetween(dueDate, today);
  if (!Number.isFinite(diffDays)) return "without_date";
  if (diffDays < 0) return "past";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";

  const daysUntilThisSunday = 7 - isoWeekday(today);
  if (diffDays <= daysUntilThisSunday) return "this_week";
  if (diffDays <= daysUntilThisSunday + 7) return "next_week";
  return "later";
}

export function getTodayInBtmTimezone(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
