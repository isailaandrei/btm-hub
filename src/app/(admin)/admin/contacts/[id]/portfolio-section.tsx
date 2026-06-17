import { PortfolioGallery } from "@/components/profile/portfolio-gallery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPortfolioItemsByContactProfileId } from "@/lib/data/profile-portfolio";

export function PortfolioSectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">
          Portfolio
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="aspect-video w-full animate-pulse rounded-md bg-muted" />
      </CardContent>
    </Card>
  );
}

export async function PortfolioSection({
  profileId,
}: {
  profileId: string | null;
}) {
  const portfolioItems = await getPortfolioItemsByContactProfileId({
    profileId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">
          Portfolio
        </CardTitle>
      </CardHeader>
      <CardContent>
        {profileId && portfolioItems.length > 0 ? (
          <PortfolioGallery items={portfolioItems} compact />
        ) : (
          <p className="text-sm text-muted-foreground">
            No portfolio images linked to this contact.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
