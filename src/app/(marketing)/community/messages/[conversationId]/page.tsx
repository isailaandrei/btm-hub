import { redirect } from "next/navigation";

export default async function LegacyConversationPage() {
  redirect("/community/messages");
}
