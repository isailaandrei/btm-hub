function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ConfirmationEmailProps {
  applicantName: string;
  programName: string;
}

export function applicationConfirmationEmail({
  applicantName,
  programName,
}: ConfirmationEmailProps): { subject: string; html: string } {
  const safeName = escapeHtml(applicantName);
  const safeProgram = escapeHtml(programName);

  return {
    subject: `Application Received — ${programName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:32px;background:#111;border-radius:12px;">
    <h1 style="color:#fff;font-size:22px;margin:0 0 16px;">
      Thanks for applying, ${safeName}!
    </h1>
    <p style="color:#a0aec0;font-size:15px;line-height:1.6;margin:0 0 16px;">
      We've received your application for the <strong style="color:#fff;">${safeProgram}</strong> program.
      Our team will review it and get back to you soon.
    </p>
    <p style="color:#a0aec0;font-size:15px;line-height:1.6;margin:0 0 24px;">
      If you have any questions in the meantime, feel free to reach out.
    </p>
    <p style="color:#666;font-size:13px;margin:0;">
      — The BTM Academy Team
    </p>
  </div>
</body>
</html>
    `.trim(),
  };
}
