const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// The only way a price reaches the screen. Prices are integer cents end to end.
export function formatPrice(cents: number) {
  if (!Number.isInteger(cents)) throw new Error(`formatPrice expects integer cents, got ${cents}`);
  return usd.format(cents / 100);
}
