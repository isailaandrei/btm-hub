import type { AcademyImportRunResult } from "@/lib/academy/import-runner";

export type AcademyImportActionState = {
  errors: Record<string, string[]> | null;
  message: string | null;
  success: boolean;
  mode: "dry-run" | "sync";
  summary: AcademyImportRunResult["summary"] | null;
  memorySync: AcademyImportRunResult["memorySync"];
};

export const initialAcademyImportActionState: AcademyImportActionState = {
  errors: null,
  message: null,
  success: false,
  mode: "dry-run",
  summary: null,
  memorySync: null,
};
