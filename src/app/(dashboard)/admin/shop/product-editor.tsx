"use client";

import { useActionState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatEuroCents } from "@/lib/shop/money";
import type { ShopProductWithVariants } from "@/lib/shop/types";
import type { ShopProductVariant } from "@/types/database";
import {
  createShopProductFormAction,
  createShopVariantFormAction,
  type ShopAdminFormState,
  updateShopProductFormAction,
  updateShopVariantFormAction,
} from "./actions";
import { ProductMediaUploader } from "./product-media-uploader";
import { RichContentEditor } from "./rich-content-editor";

const initialState: ShopAdminFormState = {
  errors: null,
  message: null,
  success: false,
  resetKey: 0,
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null;
  return <p className="mt-1 text-xs text-destructive">{errors[0]}</p>;
}

function StatusMessage({ state }: { state: ShopAdminFormState }) {
  if (!state.message) return null;
  return (
    <p className={`text-sm ${state.success ? "text-primary" : "text-destructive"}`}>
      {state.message}
    </p>
  );
}

function useRefreshOnSuccess(
  state: ShopAdminFormState,
  onSaved: () => Promise<void>,
) {
  const handledResetKeyRef = useRef(0);

  useEffect(() => {
    if (!state.success) return;
    if (state.resetKey === handledResetKeyRef.current) return;
    handledResetKeyRef.current = state.resetKey;
    void onSaved();
  }, [onSaved, state.resetKey, state.success]);
}

function inputClassName() {
  return "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary disabled:opacity-60";
}

function selectClassName() {
  return "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary disabled:opacity-60";
}

function CreateProductForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const [state, formAction, isPending] = useActionState(
    createShopProductFormAction,
    initialState,
  );
  useRefreshOnSuccess(state, onSaved);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create product</CardTitle>
        <CardDescription>Products start as drafts unless published later.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">
              Title
              <input
                key={`title-${state.resetKey}`}
                name="title"
                className={inputClassName()}
                disabled={isPending}
              />
              <FieldError errors={state.errors?.title} />
            </label>
            <label className="text-sm font-medium">
              Slug
              <input
                key={`slug-${state.resetKey}`}
                name="slug"
                className={inputClassName()}
                placeholder="mask-tee"
                disabled={isPending}
              />
              <FieldError errors={state.errors?.slug} />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium">
              Type
              <select name="type" className={selectClassName()} defaultValue="physical" disabled={isPending}>
                <option value="physical">Physical</option>
                <option value="digital">Digital</option>
                <option value="service">Service</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Visibility
              <select name="visibility" className={selectClassName()} defaultValue="members" disabled={isPending}>
                <option value="public">Public</option>
                <option value="members">Members</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Purchase access
              <select name="purchaseAccess" className={selectClassName()} defaultValue="members" disabled={isPending}>
                <option value="members">Members</option>
                <option value="public">Public</option>
              </select>
            </label>
          </div>

          <label className="text-sm font-medium">
            Short description
            <textarea
              key={`description-${state.resetKey}`}
              name="shortDescription"
              className={inputClassName()}
              rows={3}
              maxLength={500}
              disabled={isPending}
            />
            <FieldError errors={state.errors?.shortDescription} />
          </label>

          <div className="flex items-center justify-between gap-3">
            <StatusMessage state={state} />
            <Button type="submit" disabled={isPending} className="ml-auto">
              {isPending ? "Creating..." : "Create product"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function UpdateProductForm({
  product,
  onSaved,
}: {
  product: ShopProductWithVariants;
  onSaved: () => Promise<void>;
}) {
  const [state, formAction, isPending] = useActionState(
    updateShopProductFormAction,
    initialState,
  );
  useRefreshOnSuccess(state, onSaved);

  return (
    <form key={product.id} action={formAction} className="grid gap-4">
      <input type="hidden" name="productId" value={product.id} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">
          Title
          <input
            name="title"
            defaultValue={product.title}
            className={inputClassName()}
            disabled={isPending}
          />
          <FieldError errors={state.errors?.title} />
        </label>
        <label className="text-sm font-medium">
          Slug
          <input
            name="slug"
            defaultValue={product.slug}
            className={inputClassName()}
            disabled={isPending}
          />
          <FieldError errors={state.errors?.slug} />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium">
          Status
          <select name="status" defaultValue={product.status} className={selectClassName()} disabled={isPending}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Type
          <select name="type" defaultValue={product.type} className={selectClassName()} disabled={isPending}>
            <option value="physical">Physical</option>
            <option value="digital">Digital</option>
            <option value="service">Service</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Visibility
          <select name="visibility" defaultValue={product.visibility} className={selectClassName()} disabled={isPending}>
            <option value="public">Public</option>
            <option value="members">Members</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium">
          Purchase access
          <select
            name="purchaseAccess"
            defaultValue={product.purchase_access}
            className={selectClassName()}
            disabled={isPending}
          >
            <option value="members">Members</option>
            <option value="public">Public</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Tax behavior
          <select
            name="taxBehavior"
            defaultValue={product.tax_behavior}
            className={selectClassName()}
            disabled={isPending}
          >
            <option value="exclusive">Exclusive</option>
            <option value="inclusive">Inclusive</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Stripe tax code
          <input
            name="stripeTaxCode"
            defaultValue={product.stripe_tax_code ?? ""}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
      </div>

      <label className="text-sm font-medium">
        Short description
        <textarea
          name="shortDescription"
          defaultValue={product.short_description}
          className={inputClassName()}
          rows={3}
          maxLength={500}
          disabled={isPending}
        />
        <FieldError errors={state.errors?.shortDescription} />
      </label>

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="requiresCustomerNotes"
            defaultChecked={product.requires_customer_notes}
            disabled={isPending}
          />
          Customer notes
        </label>
        <label className="text-sm font-medium">
          Notes label
          <input
            name="customerNotesLabel"
            defaultValue={product.customer_notes_label}
            className={inputClassName()}
            disabled={isPending}
          />
          <FieldError errors={state.errors?.customerNotesLabel} />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <StatusMessage state={state} />
        <Button type="submit" disabled={isPending} className="ml-auto">
          {isPending ? "Saving..." : "Save product"}
        </Button>
      </div>
    </form>
  );
}

function VariantForm({
  product,
  onSaved,
}: {
  product: ShopProductWithVariants;
  onSaved: () => Promise<void>;
}) {
  const [state, formAction, isPending] = useActionState(
    createShopVariantFormAction,
    initialState,
  );
  useRefreshOnSuccess(state, onSaved);

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border border-border p-4">
      <input type="hidden" name="productId" value={product.id} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">
          Variant title
          <input
            key={`variant-title-${state.resetKey}-${product.id}`}
            name="title"
            placeholder="Black / M"
            className={inputClassName()}
            disabled={isPending}
          />
          <FieldError errors={state.errors?.title} />
        </label>
        <label className="text-sm font-medium">
          SKU
          <input
            key={`variant-sku-${state.resetKey}-${product.id}`}
            name="sku"
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <label className="text-sm font-medium">
          EUR price
          <input
            key={`variant-price-${state.resetKey}-${product.id}`}
            name="price"
            placeholder="79.00"
            className={inputClassName()}
            disabled={isPending}
          />
          <FieldError errors={state.errors?.price} />
        </label>
        <label className="text-sm font-medium">
          Stock
          <input
            key={`variant-stock-${state.resetKey}-${product.id}`}
            name="stockQuantity"
            type="number"
            min="0"
            defaultValue="0"
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
        <label className="text-sm font-medium">
          Low stock
          <input
            key={`variant-low-${state.resetKey}-${product.id}`}
            name="lowStockThreshold"
            type="number"
            min="0"
            defaultValue="0"
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
        <label className="text-sm font-medium">
          Sort
          <input
            key={`variant-sort-${state.resetKey}-${product.id}`}
            name="sortOrder"
            type="number"
            min="0"
            defaultValue={product.variants.length}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="trackInventory" defaultChecked disabled={isPending} />
          Track inventory
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="active" defaultChecked disabled={isPending} />
          Active
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <StatusMessage state={state} />
        <Button type="submit" disabled={isPending} className="ml-auto">
          {isPending ? "Adding..." : "Add variant"}
        </Button>
      </div>
    </form>
  );
}

function VariantUpdateForm({
  variant,
  onSaved,
}: {
  variant: ShopProductVariant;
  onSaved: () => Promise<void>;
}) {
  const [state, formAction, isPending] = useActionState(
    updateShopVariantFormAction,
    initialState,
  );
  useRefreshOnSuccess(state, onSaved);

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border border-border p-4">
      <input type="hidden" name="variantId" value={variant.id} />
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_0.7fr]">
        <label className="text-sm font-medium">
          Variant
          <input
            name="title"
            defaultValue={variant.title}
            className={inputClassName()}
            disabled={isPending}
          />
          <FieldError errors={state.errors?.title} />
        </label>
        <label className="text-sm font-medium">
          SKU
          <input
            name="sku"
            defaultValue={variant.sku ?? ""}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
        <label className="text-sm font-medium">
          EUR price
          <input
            name="price"
            defaultValue={(variant.price_cents / 100).toFixed(2)}
            className={inputClassName()}
            disabled={isPending}
          />
          <FieldError errors={state.errors?.price} />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <label className="text-sm font-medium">
          Stock
          <input
            name="stockQuantity"
            type="number"
            min="0"
            defaultValue={variant.stock_quantity}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
        <label className="text-sm font-medium">
          Low stock
          <input
            name="lowStockThreshold"
            type="number"
            min="0"
            defaultValue={variant.low_stock_threshold}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
        <label className="text-sm font-medium">
          Sort
          <input
            name="sortOrder"
            type="number"
            min="0"
            defaultValue={variant.sort_order}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
        <label className="text-sm font-medium">
          Tax behavior
          <select
            name="taxBehavior"
            defaultValue={variant.tax_behavior}
            className={selectClassName()}
            disabled={isPending}
          >
            <option value="exclusive">Exclusive</option>
            <option value="inclusive">Inclusive</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Stripe tax code
          <input
            name="stripeTaxCode"
            defaultValue={variant.stripe_tax_code ?? ""}
            className={inputClassName()}
            disabled={isPending}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="trackInventory"
              defaultChecked={variant.track_inventory}
              disabled={isPending}
            />
            Track inventory
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="active"
              defaultChecked={variant.active}
              disabled={isPending}
            />
            Active
          </label>
          <Badge variant={variant.active ? "default" : "outline"}>
            {variant.active ? "Active" : "Inactive"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {formatEuroCents(variant.price_cents)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <StatusMessage state={state} />
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save variant"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function VariantList({
  product,
  onSaved,
}: {
  product: ShopProductWithVariants;
  onSaved: () => Promise<void>;
}) {
  if (product.variants.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        No variants yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {product.variants.map((variant) => (
        <VariantUpdateForm
          key={variant.id}
          variant={variant}
          onSaved={onSaved}
        />
      ))}
    </div>
  );
}

export function ProductEditor({
  products,
  selectedProduct,
  onSaved,
}: {
  products: ShopProductWithVariants[];
  selectedProduct: ShopProductWithVariants | null;
  onSaved: () => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <CreateProductForm onSaved={onSaved} />

      <Card>
        <CardHeader>
          <CardTitle>Product editor</CardTitle>
          <CardDescription>
            {selectedProduct
              ? selectedProduct.title
              : products.length === 0
                ? "Create a product to start editing."
                : "Select a product from the catalog."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {selectedProduct ? (
            <>
              <UpdateProductForm
                key={`product-${selectedProduct.id}`}
                product={selectedProduct}
                onSaved={onSaved}
              />
              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-medium text-foreground">
                    Variants
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Prices are stored as integer EUR cents.
                  </p>
                </div>
                <VariantList product={selectedProduct} onSaved={onSaved} />
                <VariantForm
                  key={`new-variant-${selectedProduct.id}`}
                  product={selectedProduct}
                  onSaved={onSaved}
                />
              </div>
              <ProductMediaUploader
                key={`media-${selectedProduct.id}`}
                product={selectedProduct}
                onSaved={onSaved}
              />
              <RichContentEditor
                key={`content-${selectedProduct.id}`}
                product={selectedProduct}
                onSaved={onSaved}
              />
            </>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              No product selected.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
