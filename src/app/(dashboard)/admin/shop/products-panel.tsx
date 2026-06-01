"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEuroCents } from "@/lib/shop/money";
import type { ShopProductWithVariants } from "@/lib/shop/types";
import { loadShopAdminDataAction } from "./actions";
import { ProductEditor } from "./product-editor";

function firstPrice(product: ShopProductWithVariants) {
  const activeVariant = product.variants.find((variant) => variant.active);
  const variant = activeVariant ?? product.variants[0];
  return variant ? formatEuroCents(variant.price_cents) : "No variants";
}

export function ProductsPanel() {
  const [products, setProducts] = useState<ShopProductWithVariants[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await loadShopAdminDataAction();
      setProducts(data.products);
      setError(null);
      setSelectedProductId((current) => {
        if (current && data.products.some((product) => product.id === current)) {
          return current;
        }
        return data.products[0]?.id ?? null;
      });
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load shop products.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.05fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Catalog</CardTitle>
          <CardDescription>
            {isLoading
              ? "Loading products..."
              : `${products.length} product${products.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {products.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              No products yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Variants</TableHead>
                  <TableHead className="w-24">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow
                    key={product.id}
                    data-state={product.id === selectedProductId ? "selected" : undefined}
                  >
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          {product.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          /shop/{product.slug}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={product.status === "active" ? "default" : "outline"}
                        className="capitalize"
                      >
                        {product.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{firstPrice(product)}</TableCell>
                    <TableCell>{product.variants.length}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedProductId(product.id)}
                      >
                        Select
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProductEditor
        products={products}
        selectedProduct={selectedProduct}
        onSaved={loadProducts}
      />
    </div>
  );
}
