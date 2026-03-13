function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface AdminNotificationProps {
  applicantName: string;
  applicantEmail: string;
  programName: string;
  applicationId: string;
  baseUrl: string;
}

export function adminNewApplicationEmail({
  applicantName,
  applicantEmail,
  programName,
  applicationId,
  baseUrl,
}: AdminNotificationProps): { subject: string; html: string } {
  const safeName = escapeHtml(applicantName);
  const safeEmail = escapeHtml(applicantEmail);
  const safeProgram = escapeHtml(programName);
  const detailUrl = `${baseUrl}/admin/applications/${encodeURIComponent(applicationId)}`;

  return {
    subject: `New Application — ${applicantName} (${programName})`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:32px;background:#111;border-radius:12px;">
    <h1 style="color:#fff;font-size:22px;margin:0 0 16px;">
      New Application Received
    </h1>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <tr>
        <td style="color:#666;font-size:14px;padding:6px 0;">Program</td>
        <td style="color:#fff;font-size:14px;padding:6px 0;">${safeProgram}</td>
      </tr>
      <tr>
        <td style="color:#666;font-size:14px;padding:6px 0;">Name</td>
        <td style="color:#fff;font-size:14px;padding:6px 0;">${safeName}</td>
      </tr>
      <tr>
        <td style="color:#666;font-size:14px;padding:6px 0;">Email</td>
        <td style="color:#fff;font-size:14px;padding:6px 0;">${safeEmail}</td>
      </tr>
    </table>
    <a href="${detailUrl}" style="display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;">
      View Application
    </a>
  </div>
</body>
</html>
    `.trim(),
  };
}
