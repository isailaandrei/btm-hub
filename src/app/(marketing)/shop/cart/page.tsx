import { CartReview } from "@/components/shop/CartReview";
import {
  allowedShippingCountries,
  listActiveShippingZones,
} from "@/lib/data/shop-shipping";

export default async function ShopCartPage() {
  const zones = await listActiveShippingZones();
  return (
    <CartReview
      heading="Cart"
      shippingCountries={allowedShippingCountries(zones)}
    />
  );
}
