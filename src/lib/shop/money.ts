const EURO_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  currencyDisplay: "code",
});

export function formatEuroCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error("EUR cents must be an integer");
  }

  return EURO_FORMATTER.format(cents / 100).replace(/\u00a0/g, " ");
}

export function parseEuroCentsInput(input: string): number {
  const normalized = input.trim().replace(",", ".");

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Enter a valid EUR price");
  }

  return Math.round(Number(normalized) * 100);
}
