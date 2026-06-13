export function isLocalAdminAiEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_SHOW_ADMIN_AI === "1"
  );
}
