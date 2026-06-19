import type { EmailSendKind } from "@/types/database";

export const BROADCAST_CONFIRMATION_MESSAGE =
  "This newsletter will be sent to all eligible contacts. Do you want to proceed?";

export function requiresBroadcastConfirmation(kind: EmailSendKind): boolean {
  return kind === "broadcast";
}
