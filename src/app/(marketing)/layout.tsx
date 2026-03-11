import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getNavbarUser } from "@/lib/data/auth";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getNavbarUser();

  return (
    <>
      <Navbar variant="dark" user={user} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
