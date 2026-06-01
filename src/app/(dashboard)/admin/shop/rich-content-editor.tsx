"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { parseShopContentBlocks } from "@/lib/shop/content-blocks";
import type { ShopProductWithVariants } from "@/lib/shop/types";
import {
  type ShopAdminFormState,
  updateShopProductContentFormAction,
} from "./actions";

const initialState: ShopAdminFormState = {
  errors: null,
  message: null,
  success: false,
  resetKey: 0,
};

function inputClassName() {
  return "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary disabled:opacity-60";
}

function contentDefaults(product: ShopProductWithVariants) {
  const parsed = parseShopContentBlocks(product.content_blocks);
  const richText = parsed.find((block) => block.type === "rich_text");
  const bullets = parsed.find((block) => block.type === "bullets");
  const specs = parsed.find((block) => block.type === "specs");

  return {
    richText: richText?.type === "rich_text" ? richText.body : "",
    bulletTitle: bullets?.type === "bullets" ? bullets.title : "Highlights",
    bullets: bullets?.type === "bullets" ? bullets.items.join("\n") : "",
    specs:
      specs?.type === "specs"
        ? specs.rows.map((row) => `${row.label}: ${row.value}`).join("\n")
        : "",
  };
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <p className="mt-1 text-xs text-destructive">{errors[0]}</p>;
}

export function RichContentEditor({
  product,
  onSaved,
}: {
  product: ShopProductWithVariants;
  onSaved: () => Promise<void>;
}) {
  const [state, formAction, isPending] = useActionState(
    updateShopProductContentFormAction,
    initialState,
  );
  const defaults = contentDefaults(product);
  const handledResetKeyRef = useRef(0);

  useEffect(() => {
    if (!state.success) return;
    if (state.resetKey === handledResetKeyRef.current) return;
    handledResetKeyRef.current = state.resetKey;
    void onSaved();
  }, [onSaved, state.resetKey, state.success]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-medium text-foreground">Content blocks</h2>
        <p className="text-sm text-muted-foreground">
          Add the product detail content shown below the gallery.
        </p>
      </div>

      <form key={product.id} action={formAction} className="grid gap-4">
        <input type="hidden" name="productId" value={product.id} />

        <label className="text-sm font-medium">
          Rich text
          <textarea
            name="richText"
            defaultValue={defaults.richText}
            className={inputClassName()}
            rows={5}
            disabled={isPending}
          />
          <FieldError errors={state.errors?.richText} />
        </label>

        <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
          <label className="text-sm font-medium">
            Bullet title
            <input
              name="bulletTitle"
              defaultValue={defaults.bulletTitle}
              className={inputClassName()}
              disabled={isPending}
            />
          </label>
          <label className="text-sm font-medium">
            Bullets
            <textarea
              name="bullets"
              defaultValue={defaults.bullets}
              className={inputClassName()}
              rows={5}
              placeholder="One bullet per line"
              disabled={isPending}
            />
          </label>
        </div>

        <label className="text-sm font-medium">
          Specs
          <textarea
            name="specs"
            defaultValue={defaults.specs}
            className={inputClassName()}
            rows={5}
            placeholder="Material: 100% organic cotton"
            disabled={isPending}
          />
        </label>

        <div className="flex items-center justify-between gap-3">
          {state.message ? (
            <p className={`text-sm ${state.success ? "text-primary" : "text-destructive"}`}>
              {state.message}
            </p>
          ) : null}
          <Button type="submit" disabled={isPending} className="ml-auto">
            {isPending ? "Saving..." : "Save content"}
          </Button>
        </div>
      </form>
    </section>
  );
}
