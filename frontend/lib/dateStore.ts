import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last_7d'
  | 'last_14d'
  | 'last_30d'
  | 'this_month'
  | 'last_month'
  | 'maximum';

export interface DateRange {
  preset: DatePreset | null;
  since: string | null; // YYYY-MM-DD
  until: string | null; // YYYY-MM-DD
}

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_14d', label: 'Last 14 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'maximum', label: 'Maximum' },
];

/** Returns human-readable label for the current date range */
export function getDateRangeLabel(range: DateRange): string {
  if (range.preset) {
    return DATE_PRESETS.find((p) => p.value === range.preset)?.label ?? range.preset;
  }
  if (range.since && range.until) {
    return `${range.since} – ${range.until}`;
  }
  return 'Last 30 days';
}

/** Converts DateRange to Meta API query params */
export function toMetaDateParams(range: DateRange): Record<string, string> {
  if (range.preset) {
    return { date_preset: range.preset };
  }
  if (range.since && range.until) {
    return {
      since: range.since,
      until: range.until,
    };
  }
  return { date_preset: 'last_30d' };
}

interface DateStoreState {
  range: DateRange;
  setRange: (range: DateRange) => void;
  setPreset: (preset: DatePreset) => void;
  setCustomRange: (since: string, until: string) => void;
}

export const useDateStore = create<DateStoreState>()(
  persist(
    (set) => ({
      range: { preset: 'last_30d', since: null, until: null },

      setRange: (range) => set({ range }),

      setPreset: (preset) =>
        set({ range: { preset, since: null, until: null } }),

      setCustomRange: (since, until) =>
        set({ range: { preset: null, since, until } }),
    }),
    {
      name: 'adinsight-date-range',
    }
  )
);
