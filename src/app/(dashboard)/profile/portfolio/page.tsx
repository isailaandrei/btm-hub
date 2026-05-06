import { redirect } from "next/navigation";
import { getPortfolioItemsByProfileId } from "@/lib/data/profile-portfolio";
import { getProfile } from "@/lib/data/profiles";
import { PortfolioUploader } from "./portfolio-uploader";

export default async function ProfilePortfolioPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const items = await getPortfolioItemsByProfileId(profile.id);
  const portfolioStateKey = items
    .map((item) => `${item.id}:${item.updated_at}`)
    .join("|");

  return (
    <>
      <h1 className="mb-8 text-[length:var(--font-size-h1)] font-medium text-foreground">
        Portfolio
      </h1>
      <PortfolioUploader
        key={portfolioStateKey}
        profileId={profile.id}
        initialItems={items}
      />
    </>
  );
}
