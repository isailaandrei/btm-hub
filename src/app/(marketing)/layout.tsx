import { Suspense } from "react";
import { draftMode } from "next/headers";
import { VisualEditing } from "next-sanity/visual-editing";
import { SiteHeader } from "@/components/nav/site-header";
import { Footer } from "@/components/layout/Footer";
import { SanityLive } from "@/lib/sanity/live";
import { getNavbarUser } from "@/lib/data/auth";

async function isDraftMode() {
  try {
    return (await draftMode()).isEnabled;
  } catch {
    return false;
  }
}

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [draft, initialUser] = await Promise.all([
    isDraftMode(),
    getNavbarUser(),
  ]);

  return (
    <>
      <SiteHeader initialUser={initialUser} />
      <main>{children}</main>
      <Footer />
      <Suspense>
        <SanityLive />
      </Suspense>
      {draft && <VisualEditing />}
    </>
  );
}
