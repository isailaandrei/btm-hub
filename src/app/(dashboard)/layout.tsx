import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  let user = null;
  if (authUser) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", authUser.id)
      .single();

    user = {
      id: authUser.id,
      displayName: profile?.display_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
    };
  }

  return (
    <>
      <Navbar variant="dark" user={user} />
      <main className="min-h-screen bg-brand-background px-5 py-10 md:px-24 md:py-16">
        {children}
      </main>
      <Footer />
    </>
  );
}
