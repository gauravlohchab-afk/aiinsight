'use client';

import { useCurrencyStore, type Currency } from '@/lib/currencyStore';
import { cn } from '@/lib/utils';

const OPTIONS: { value: Currency; label: string }[] = [
  { value: 'USD', label: '$' },
  { value: 'INR', label: '₹' },
  { value: 'PHP', label: '₱' },
];

export function CurrencySwitcher() {
  const { currency, setCurrency } = useCurrencyStore();

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-surface-950 border border-white/5 p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setCurrency(opt.value)}
          title={opt.value}
          className={cn(
            'px-2.5 py-1 text-xs font-semibold rounded-md transition-all',
            currency === opt.value
              ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
              : 'text-surface-500 hover:text-white'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
