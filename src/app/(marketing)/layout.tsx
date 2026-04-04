import { Suspense } from "react";
import { draftMode } from "next/headers";
import { VisualEditing } from "next-sanity/visual-editing";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SanityLive } from "@/lib/sanity/live";

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
  const draft = await isDraftMode();

  return (
    <>
      <Navbar variant="dark" />
      <main>{children}</main>
      <Footer />
      <Suspense>
        <SanityLive />
      </Suspense>
      {draft && <VisualEditing />}
    </>
  );
}
