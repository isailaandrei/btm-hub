import { cache } from "react";
import { getProfile } from "@/lib/data/profiles";
import { createClient } from "@/lib/supabase/server";
import type { ShopOrderWithItems } from "@/lib/shop/types";

const ORDER_SELECT = `
  *,
  items:shop_order_items(*),
  events:shop_order_events(*)
`;

function sortOrderRelations(order: ShopOrderWithItems): ShopOrderWithItems {
  return {
    ...order,
    items: [...(order.items ?? [])].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    }),
    events: [...(order.events ?? [])].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    ),
  };
}

export const getMyShopOrders = cache(async function getMyShopOrders() {
  const profile = await getProfile();
  if (!profile) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_orders")
    .select(ORDER_SELECT)
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load your orders: ${error.message}`);
  return ((data ?? []) as ShopOrderWithItems[]).map(sortOrderRelations);
});
