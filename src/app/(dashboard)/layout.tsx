import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getNavbarUser } from "@/lib/data/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getNavbarUser();

  return (
    <>
      <Navbar variant="dark" user={user} />
      <main className="min-h-screen bg-brand-secondary px-5 py-10 md:px-24 md:py-16">
        {children}
      </main>
      <Footer />
    </>
  );
}
