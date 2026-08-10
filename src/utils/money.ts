export function eurosToCents(value: number): number {
  return Math.round(value * 100);
}

export function centsToEuros(value: number): number {
  return value / 100;
}

export function formatMoney(cents: number, currency = 'EUR', locale = 'en-IE'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(centsToEuros(cents));
}
