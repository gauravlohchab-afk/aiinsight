import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';
import { useCurrencyStore, formatMetaValue } from '@/lib/currencyStore';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a monetary value for display.
 * Reads both the display currency and the Meta account's native currency from the Zustand store.
 * The account's native currency is set automatically when the user selects an ad account.
 */
export function formatCurrency(value: number | string): string {
  const num = Number(value || 0);
  const { currency: displayCurrency, accountCurrency } = useCurrencyStore.getState();
  return formatMetaValue(num, accountCurrency, displayCurrency);
}

export function formatNumber(value: number, compact = false): string {
  if (compact && value >= 1000) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatRoas(value: number): string {
  return `${value.toFixed(2)}x`;
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy');
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function getHealthScoreColor(score: number): string {
  if (score >= 80) return 'text-accent-cyan';
  if (score >= 60) return 'text-accent-green';
  if (score >= 40) return 'text-accent-amber';
  if (score >= 20) return 'text-orange-400';
  return 'text-accent-red';
}

export function getHealthScoreBg(score: number): string {
  if (score >= 80) return 'bg-cyan-500/10 border-cyan-500/30';
  if (score >= 60) return 'bg-green-500/10 border-green-500/30';
  if (score >= 40) return 'bg-amber-500/10 border-amber-500/30';
  if (score >= 20) return 'bg-orange-500/10 border-orange-500/30';
  return 'bg-red-500/10 border-red-500/30';
}

export function getImpactColor(impact: 'high' | 'medium' | 'low'): string {
  return {
    high: 'text-red-400 bg-red-500/10',
    medium: 'text-amber-400 bg-amber-500/10',
    low: 'text-green-400 bg-green-500/10',
  }[impact];
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'text-green-400 bg-green-500/10',
    PAUSED: 'text-amber-400 bg-amber-500/10',
    DELETED: 'text-red-400 bg-red-500/10',
    ARCHIVED: 'text-surface-500 bg-surface-800',
  };
  return map[status] || 'text-surface-400 bg-surface-800';
}

export function getChangeIndicator(value: number): {
  icon: '↑' | '↓' | '→';
  color: string;
  isPositive: boolean;
} {
  if (value > 2) return { icon: '↑', color: 'text-accent-green', isPositive: true };
  if (value < -2) return { icon: '↓', color: 'text-accent-red', isPositive: false };
  return { icon: '→', color: 'text-surface-400', isPositive: true };
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}…`;
}

export function generateChartColors(count: number): string[] {
  const colors = [
    '#5b63f8', '#22d3ee', '#4ade80', '#fbbf24',
    '#f87171', '#c084fc', '#fb923c', '#34d399',
    '#60a5fa', '#a78bfa', '#f472b6', '#94a3b8',
  ];
  return Array.from({ length: count }, (_, i) => colors[i % colors.length]);
}
