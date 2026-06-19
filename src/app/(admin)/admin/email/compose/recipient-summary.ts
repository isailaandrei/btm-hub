import type { EmailSendKind } from "@/types/database";

export function getRecipientSummary(input: {
  kind: EmailSendKind;
  selectedContactCount: number;
  selectedManualRecipientCount: number;
}): { headline: string; detail: string } {
  if (input.kind === "broadcast") {
    return {
      headline: "All contacts with email",
      detail:
        "A newsletter goes to every contact with an email, skipping unsubscribes and excluded addresses.",
    };
  }

  const totalSelected =
    input.selectedContactCount + input.selectedManualRecipientCount;
  if (input.selectedManualRecipientCount > 0) {
    return {
      headline: `${totalSelected} selected recipient${
        totalSelected === 1 ? "" : "s"
      }`,
      detail:
        "A targeted email reaches the selected contacts and saved recipients, minus anyone excluded.",
    };
  }

  return {
    headline: `${input.selectedContactCount} selected contact${
      input.selectedContactCount === 1 ? "" : "s"
    }`,
    detail:
      "A targeted email reaches the selected contacts, minus anyone excluded.",
  };
}
