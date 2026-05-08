export const SHOP_RESERVATION_TTL_MS = 30 * 60 * 1000;

export function getReservationExpiry(now = new Date()): Date {
  return new Date(now.getTime() + SHOP_RESERVATION_TTL_MS);
}
