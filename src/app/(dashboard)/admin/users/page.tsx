import { redirect } from "next/navigation";

// Redirect so URLs like /admin/users (from bookmarks) still work
export default function UsersPage() {
  redirect("/admin");
}
