import { z } from "zod/v4";

const richTextBlockSchema = z.object({
  type: z.literal("rich_text"),
  body: z.string().trim().min(1).max(8000),
});

const mediaBlockSchema = z.object({
  type: z.literal("media"),
  mediaId: z.string().trim().min(1),
  caption: z.string().trim().max(300).optional(),
});

const specsBlockSchema = z.object({
  type: z.literal("specs"),
  rows: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        value: z.string().trim().min(1).max(300),
      }),
    )
    .min(1)
    .max(30),
});

const bulletsBlockSchema = z.object({
  type: z.literal("bullets"),
  title: z.string().trim().min(1).max(120),
  items: z.array(z.string().trim().min(1).max(240)).min(1).max(20),
});

const shopContentBlockSchema = z.discriminatedUnion("type", [
  richTextBlockSchema,
  mediaBlockSchema,
  specsBlockSchema,
  bulletsBlockSchema,
]);

export type ShopContentBlock = z.infer<typeof shopContentBlockSchema>;

export function parseShopContentBlocks(input: unknown): ShopContentBlock[] {
  const result = z.array(shopContentBlockSchema).safeParse(input);

  if (!result.success) {
    throw new Error(`Invalid product content: ${result.error.issues[0]?.message ?? "unknown error"}`);
  }

  return result.data;
}
