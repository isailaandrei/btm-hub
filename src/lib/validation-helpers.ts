const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(value: string): boolean {
  return UUID_RE.test(value);
}

export function validateUUID(value: string, label = "application"): void {
  if (!isUUID(value)) throw new Error(`Invalid ${label} ID`);
}
