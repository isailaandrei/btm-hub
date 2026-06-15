import { parseOptionalBooleanEnv } from "./env";

export function isAdminAiEvidenceEnabled(): boolean {
  return parseOptionalBooleanEnv(process.env.ADMIN_AI_INCLUDE_EVIDENCE) ?? false;
}
