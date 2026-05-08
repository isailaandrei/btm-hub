import type { ShopProductMedia } from "@/types/database";

export function ProductGallery({
  media,
  title,
}: {
  media: ShopProductMedia[];
  title: string;
}) {
  const ordered = [...media].sort((a, b) => a.sort_order - b.sort_order);
  const primary = ordered.find((item) => item.is_primary) ?? ordered[0];

  return (
    <div className="grid gap-3">
      <div className="aspect-[4/5] overflow-hidden rounded-lg bg-muted">
        {primary?.public_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primary.public_url}
            alt={primary.alt_text || title}
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      {ordered.length > 1 ? (
        <div className="grid grid-cols-4 gap-2">
          {ordered.slice(0, 4).map((item) => (
            <div
              key={item.id}
              className="aspect-square overflow-hidden rounded-md bg-muted"
            >
              {item.public_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.public_url}
                  alt={item.alt_text || title}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
