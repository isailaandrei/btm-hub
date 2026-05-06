type SavedApplicationForm = {
  formVersion: string;
  step: number;
  answers: Record<string, unknown>;
};

const STORAGE_PREFIX = "btm-application-";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampStep(value: unknown, maxStep: number): number {
  if (!Number.isInteger(value)) return 0;

  const safeMaxStep =
    Number.isInteger(maxStep) && maxStep > 0 ? maxStep : 0;
  return Math.min(Math.max(value as number, 0), safeMaxStep);
}

export function readSavedApplicationForm(
  programSlug: string,
  formVersion: string,
  maxStep: number,
): SavedApplicationForm | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + programSlug);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.formVersion !== formVersion) return null;

    return {
      formVersion,
      step: clampStep(parsed.step, maxStep),
      answers: isRecord(parsed.answers) ? parsed.answers : {},
    };
  } catch {
    return null;
  }
}
