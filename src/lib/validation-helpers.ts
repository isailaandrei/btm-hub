const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(value: string): boolean {
  return UUID_RE.test(value);
}

export function validateUUID(value: string, label = "application"): void {
  if (!isUUID(value)) throw new Error(`Invalid ${label} ID`);
}

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isValidISODate(value: string): boolean {
  return ISO_DATE_RE.test(value) && !isNaN(Date.parse(value));
}
