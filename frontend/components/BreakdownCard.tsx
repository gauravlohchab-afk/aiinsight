'use client';

import { Layers } from 'lucide-react';
import { BreakdownPieChart } from '@/components/charts/SpendChart';
import { formatCurrency, formatPercent } from '@/lib/utils';

interface BreakdownRow {
  dimension: string;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
}

interface BreakdownCardProps {
  title: string;
  data: BreakdownRow[];
  isLoading?: boolean;
}

export default function BreakdownCard({ title, data, isLoading }: BreakdownCardProps) {
  const totalSpend = data.reduce((sum, row) => sum + (row.spend || 0), 0);
  const totalConversions = data.reduce((sum, row) => sum + (row.conversions || 0), 0);
  const avgCtr = data.length
    ? data.reduce((sum, row) => sum + (row.ctr || 0), 0) / data.length
    : 0;
  const topSegment = data
    .slice()
    .sort((left, right) => (right.spend || 0) - (left.spend || 0))[0];

  return (
    <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(91,140,255,0.18),_transparent_48%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.94))] p-1 shadow-[0_24px_80px_rgba(2,6,23,0.55)]">
      <div className="h-full rounded-[24px] border border-white/5 bg-slate-950/80 p-5 backdrop-blur">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-white/5 text-brand-300">
                <Layers size={15} />
              </div>
              <h3 className="text-base font-semibold text-white">{title}</h3>
            </div>
            <p className="mt-2 text-xs text-surface-500">Complete segmentation for the current reporting range</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-surface-500">Avg CTR</p>
            <p className="text-sm font-semibold text-white">{formatPercent(avgCtr)}</p>
          </div>
        </div>

        <BreakdownPieChart title={title} data={data} isLoading={isLoading} hideHeader />

        {!isLoading && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/5 bg-white/5 px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-surface-500">Spend</p>
              <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(totalSpend)}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-surface-500">Conversions</p>
              <p className="mt-1 text-sm font-semibold text-white">{Math.round(totalConversions)}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-surface-500">Top Segment</p>
              <p className="mt-1 truncate text-sm font-semibold text-white capitalize">{topSegment?.dimension || 'N/A'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}