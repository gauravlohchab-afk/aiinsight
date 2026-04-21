import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Currency = 'USD' | 'INR' | 'PHP';

interface CurrencyState {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** Native currency of the currently selected Meta ad account (e.g. 'INR', 'PHP', 'USD') */
  accountCurrency: string;
  setAccountCurrency: (c: string) => void;
}

// Conversion rates relative to USD
export const CURRENCY_RATES: Record<Currency, number> = {
  USD: 1,
  INR: 83.5,
  PHP: 56.2,
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  INR: '₹',
  PHP: '₱',
};

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set) => ({
      currency: 'USD',
      setCurrency: (currency) => set({ currency }),
      accountCurrency: 'USD',
      setAccountCurrency: (accountCurrency) => set({ accountCurrency }),
    }),
    {
      name: 'adinsight-currency',
      partialize: (state) => ({ currency: state.currency }), // don't persist accountCurrency — re-derived on load
    }
  )
);

/** Convert a USD value to the selected display currency */
/**
 * Convert a value from its source currency (e.g. Meta account currency) to USD.
 * Meta always returns spend/budget in the ad account's native currency — NOT USD.
 */
export function toUSD(value: number, sourceCurrency: string): number {
  const rate = CURRENCY_RATES[sourceCurrency as Currency] ?? 1;
  return rate === 0 ? value : value / rate;
}

/**
 * Convert from source currency (Meta account native) to display currency.
 * Use this instead of convertFromUSD when you have the account's native currency.
 */
export function convertCurrency(value: number, fromCurrency: string, toCurrency: Currency): number {
  if (fromCurrency === toCurrency) return value;
  const usd = toUSD(value, fromCurrency);
  return usd * CURRENCY_RATES[toCurrency];
}

/** @deprecated Meta values are NOT in USD — use convertCurrency() with the account's native currency */
export function convertFromUSD(usdValue: number, currency: Currency): number {
  return usdValue * CURRENCY_RATES[currency];
}

/**
 * Format a monetary value from Meta (already in account's native currency) for display.
 * Pass the account's metaCurrency so we can correctly convert to the selected display currency.
 */
export function formatMetaValue(value: number, metaCurrency: string, displayCurrency: Currency): string {
  const converted = convertCurrency(value, metaCurrency, displayCurrency);
  const symbol = CURRENCY_SYMBOLS[displayCurrency];
  const locale = displayCurrency === 'INR' ? 'en-IN' : 'en-US';
  const formatted = converted.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

/** Format a USD value in the display currency — always full number, no K/M abbreviation */
export function formatInCurrency(usdValue: number, currency: Currency): string {
  const converted = convertFromUSD(usdValue, currency);
  const symbol = CURRENCY_SYMBOLS[currency];

  // Use locale-aware formatting with 2 decimal places for clean display
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  const formatted = converted.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${symbol}${formatted}`;
}

/** Compact version for chart axis ticks only — uses K/L/M abbreviations */
/** Compact format for chart axis ticks. Pass an already-converted value (not USD). */
export function formatInCurrencyCompact(alreadyConvertedValue: number, currency: Currency): string {
  const v = alreadyConvertedValue;
  const symbol = CURRENCY_SYMBOLS[currency];

  if (currency === 'INR') {
    if (v >= 100_000) return `${symbol}${(v / 100_000).toFixed(1)}L`;
    if (v >= 1_000)   return `${symbol}${(v / 1_000).toFixed(1)}K`;
  } else {
    if (v >= 1_000_000) return `${symbol}${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `${symbol}${(v / 1_000).toFixed(1)}K`;
  }
  return `${symbol}${v.toFixed(0)}`;
}
