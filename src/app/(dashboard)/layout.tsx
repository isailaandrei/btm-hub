import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar variant="dark" />
      <main className="min-h-screen bg-muted px-5 py-10 md:px-24 md:py-16">
        {children}
      </main>
      <Footer />
    </>
  );
}
