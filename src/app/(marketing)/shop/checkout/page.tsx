import { CartReview } from "@/components/shop/CartReview";
import {
  allowedShippingCountries,
  listActiveShippingZones,
} from "@/lib/data/shop-shipping";

export default async function ShopCheckoutPage() {
  const zones = await listActiveShippingZones();
  return (
    <CartReview
      heading="Checkout"
      shippingCountries={allowedShippingCountries(zones)}
    />
  );
}
