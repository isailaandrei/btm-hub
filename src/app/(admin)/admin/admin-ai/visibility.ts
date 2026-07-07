// Single switch for the AI Agent surfaces (sidebar item, header title,
// dashboard panel). Flag-only on purpose: production enables it by setting
// NEXT_PUBLIC_SHOW_ADMIN_AI=1 in the deploy env, and unsetting it is the
// kill switch. NEXT_PUBLIC_* is inlined at BUILD time — changing it requires
// a redeploy, not just an env edit.
export function isAdminAiEnabled() {
  return process.env.NEXT_PUBLIC_SHOW_ADMIN_AI === "1";
}
