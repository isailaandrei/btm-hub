import type {
  EmailProvider,
  NormalizedProviderEvent,
  ProviderSendEmailInput,
  ProviderSendEmailResult,
} from "./types";

export function createFakeEmailProvider(): EmailProvider {
  return {
    name: "fake",
    async sendEmail(
      input: ProviderSendEmailInput,
    ): Promise<ProviderSendEmailResult> {
      return {
        provider: "fake",
        providerMessageId: `fake-${input.recipientId}`,
        raw: {
          accepted: true,
          recipientId: input.recipientId,
          sendId: input.sendId,
        },
      };
    },
    parseWebhook(): NormalizedProviderEvent[] {
      return [];
    },
  };
}
