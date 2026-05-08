import { parseShopContentBlocks } from "@/lib/shop/content-blocks";

export function RichContentBlocks({ blocks }: { blocks: unknown[] }) {
  const parsed = parseShopContentBlocks(blocks);

  if (parsed.length === 0) return null;

  return (
    <div className="mt-12 space-y-8">
      {parsed.map((block, index) => {
        if (block.type === "rich_text") {
          return (
            <p key={index} className="max-w-3xl text-muted-foreground">
              {block.body}
            </p>
          );
        }

        if (block.type === "bullets") {
          return (
            <section key={index}>
              <h2 className="mb-3 text-lg font-medium text-foreground">
                {block.title}
              </h2>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          );
        }

        if (block.type === "specs") {
          return (
            <dl
              key={index}
              className="grid max-w-2xl divide-y divide-border rounded-lg border border-border"
            >
              {block.rows.map((row) => (
                <div key={row.label} className="grid grid-cols-3 gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="col-span-2 text-sm text-foreground">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          );
        }

        return null;
      })}
    </div>
  );
}
