export function getApplicantName(
  answers: Record<string, unknown>,
  fallback = "—",
): string {
  return (
    [answers.first_name, answers.last_name].filter(Boolean).join(" ") ||
    fallback
  );
}
