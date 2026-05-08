import type { ShopProduct } from "@/types/database";
import type { ShopViewer } from "./types";

function isAdmin(viewer: ShopViewer): boolean {
  return viewer?.role === "admin";
}

function isMemberOrAdmin(viewer: ShopViewer): boolean {
  return viewer?.role === "member" || viewer?.role === "admin";
}

export function canViewProduct(product: ShopProduct, viewer: ShopViewer): boolean {
  if (isAdmin(viewer)) return true;
  if (product.status !== "active") return false;
  if (product.visibility === "public") return true;
  if (product.visibility === "members") return isMemberOrAdmin(viewer);
  return false;
}

export function canPurchaseProduct(product: ShopProduct, viewer: ShopViewer): boolean {
  if (!canViewProduct(product, viewer)) return false;
  if (!isMemberOrAdmin(viewer)) return false;
  if (product.purchase_access === "public") return true;
  return isMemberOrAdmin(viewer);
}
