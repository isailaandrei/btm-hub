export function getEmailFromEmail(): string {
  return (
    process.env.EMAIL_FROM_EMAIL?.trim() ||
    process.env.BREVO_FROM_EMAIL?.trim() ||
    "owner@behind-the-mask.com"
  );
}

export function getEmailFromName(): string {
  return process.env.EMAIL_FROM_NAME?.trim() || "Behind The Mask";
}

export function getEmailReplyToEmail(): string {
  return (
    process.env.EMAIL_REPLY_TO_EMAIL?.trim() ||
    process.env.OWNER_EMAIL_FORWARD_TO?.trim() ||
    getEmailFromEmail()
  );
}

export type EmailProviderName = "brevo" | "fake";

export function isProductionEmailEnvironment(): boolean {
  // Host-agnostic production detection. `APP_ENV` is the portable signal set
  // explicitly per deployment (Hostinger/VPS/etc.); `VERCEL_ENV` is kept as a
  // fallback so a Vercel deployment still works unchanged; `EMAIL_REQUIRE_REAL_PROVIDER`
  // is the explicit force-real override.
  return (
    process.env.APP_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.EMAIL_REQUIRE_REAL_PROVIDER === "true"
  );
}

export function getEmailProviderName(): EmailProviderName {
  const provider = process.env.EMAIL_PROVIDER?.trim();
  if (!provider) {
    throw new Error("EMAIL_PROVIDER must be set before sending email");
  }
  if (provider !== "brevo" && provider !== "fake") {
    throw new Error(`Unsupported email provider: ${provider}`);
  }
  if (provider === "fake" && isProductionEmailEnvironment()) {
    throw new Error("EMAIL_PROVIDER=fake is not allowed in production");
  }
  getEmailTestRecipientOverride();
  return provider;
}

export function getEmailTestRecipientOverride(): string | null {
  const override = process.env.EMAIL_TEST_RECIPIENT_OVERRIDE?.trim() || null;
  if (override && isProductionEmailEnvironment()) {
    throw new Error(
      "EMAIL_TEST_RECIPIENT_OVERRIDE is not allowed in production or real-provider mode",
    );
  }
  return override;
}

export function getEmailWorkerSecret(): string | null {
  return process.env.EMAIL_WORKER_SECRET?.trim() || null;
}

export function getBrevoWebhookToken(): string | null {
  return process.env.BREVO_WEBHOOK_TOKEN?.trim() || null;
}

function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getPublicSiteUrl(): string {
  return normalizeOrigin(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      process.env.VERCEL_URL ||
      "http://localhost:3000",
  );
}

export function getEmailWorkerOrigin(): string {
  return normalizeOrigin(
    process.env.EMAIL_WORKER_ORIGIN ||
      process.env.VERCEL_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      "http://localhost:3000",
  );
}
