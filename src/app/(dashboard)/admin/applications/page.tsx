import { redirect } from "next/navigation";

// Redirect so URLs like /admin/applications (from bookmarks or trimmed detail URLs) still work
export default function ApplicationsPage() {
  redirect("/admin");
}
