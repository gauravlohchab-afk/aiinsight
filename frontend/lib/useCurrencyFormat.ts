'use client';

import { useCurrencyStore, formatMetaValue, type Currency } from '@/lib/currencyStore';

/**
 * Hook that returns a currency formatter respecting the user's selected currency
 * and the Meta ad account's native currency.
 */
export function useCurrencyFormat() {
  const { currency, accountCurrency } = useCurrencyStore();

  return {
    currency,
    fmt: (metaValue: number) => formatMetaValue(metaValue, accountCurrency, currency),
    fmtCompact: (metaValue: number) => formatMetaValue(metaValue, accountCurrency, currency),
  };
}
