export type EmailRenderVariables = Record<string, unknown>;

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function readPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, source);
}

export function interpolateEmailVariables(
  value: string,
  variables: EmailRenderVariables,
): string {
  return value.replace(VARIABLE_PATTERN, (match, variableName: string) => {
    const resolved = readPath(variables, variableName);
    if (resolved == null) return match;
    if (typeof resolved === "string") return resolved;
    if (typeof resolved === "number" || typeof resolved === "boolean") {
      return String(resolved);
    }
    return match;
  });
}

export function flattenEmailVariables(
  variables: EmailRenderVariables,
): Record<string, string> {
  const flattened: Record<string, string> = {};

  function visit(value: unknown, prefix: string) {
    if (value == null) return;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      flattened[prefix] = String(value);
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [key, nestedValue] of Object.entries(value)) {
      visit(nestedValue, prefix ? `${prefix}.${key}` : key);
    }
  }

  visit(variables, "");
  return flattened;
}
