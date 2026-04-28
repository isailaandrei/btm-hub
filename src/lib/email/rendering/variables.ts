export interface EmailRenderVariables {
  contact?: {
    id?: string;
    name?: string;
    email?: string;
  };
  unsubscribe?: {
    url?: string;
  };
  program?: {
    name?: string;
  };
}

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function readPath(source: Record<string, unknown>, path: string): string {
  let current: unknown = source;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return "";
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" || typeof current === "number"
    ? String(current)
    : "";
}

export function interpolateEmailVariables(
  input: string,
  variables: EmailRenderVariables,
): string {
  return input.replace(VARIABLE_PATTERN, (_match, path: string) =>
    readPath(variables as Record<string, unknown>, path),
  );
}
