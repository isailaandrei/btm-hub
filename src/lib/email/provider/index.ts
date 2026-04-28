import { createFakeEmailProvider } from "./fake";
import { createPostmarkEmailProvider } from "./postmark";
import type { EmailProvider } from "./types";

export function getEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER?.trim() || "fake";
  if (provider === "fake") return createFakeEmailProvider();
  if (provider === "postmark") return createPostmarkEmailProvider();
  throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
}
