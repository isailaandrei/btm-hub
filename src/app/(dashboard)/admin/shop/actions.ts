"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { createShopProduct } from "@/lib/data/shop-admin";

const productInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a URL-safe slug"),
  type: z.enum(["physical", "digital", "service"]),
  visibility: z.enum(["public", "members", "hidden"]),
  purchaseAccess: z.enum(["public", "members"]),
  shortDescription: z.string().trim().max(500),
});

function validationErrors(error: z.ZodError) {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    errors[key] = [...(errors[key] ?? []), issue.message];
  }
  return errors;
}

export async function createShopProductAction(input: unknown) {
  const parsed = productInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      errors: validationErrors(parsed.error),
      message: "Check the product fields.",
    };
  }

  const product = await createShopProduct(parsed.data);
  revalidatePath("/admin");
  revalidatePath("/shop");

  return { productId: product.id as string, errors: {}, message: "Product created." };
}
