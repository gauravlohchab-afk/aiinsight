'use client';

import { useMemo } from 'react';

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

interface Props {
  data: BreakdownRow[];
  isLoading?: boolean;
}

function fmt(n: number, decimals = 0) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(decimals);
}

export default function BreakdownTable({ data, isLoading }: Props) {
  const maxSpend = useMemo(
    () => Math.max(...data.map((r) => r.spend), 1),
    [data]
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data.length) {
    return (
      <p className="text-sm text-white/40 py-4 text-center">
        No breakdown data available for the selected range.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-white/40 text-xs uppercase tracking-wider border-b border-white/5">
            <th className="text-left pb-2 pr-4 font-medium">Segment</th>
            <th className="text-right pb-2 px-2 font-medium">Spend</th>
            <th className="text-right pb-2 px-2 font-medium">Impr.</th>
            <th className="text-right pb-2 px-2 font-medium">Clicks</th>
            <th className="text-right pb-2 px-2 font-medium">CTR</th>
            <th className="text-right pb-2 px-2 font-medium">CPC</th>
            <th className="text-right pb-2 pl-2 font-medium">Conv.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {data.map((row) => {
            const barWidth = Math.max(4, Math.round((row.spend / maxSpend) * 100));
            return (
              <tr key={row.dimension} className="hover:bg-white/[0.03] transition-colors">
                <td className="py-2.5 pr-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-white/80 font-medium capitalize">
                      {row.dimension}
                    </span>
                    <div className="h-1 rounded-full bg-white/5 w-32">
                      <div
                        className="h-1 rounded-full bg-violet-500"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-2 text-right text-white/70">${fmt(row.spend, 2)}</td>
                <td className="py-2.5 px-2 text-right text-white/60">{fmt(row.impressions)}</td>
                <td className="py-2.5 px-2 text-right text-white/60">{fmt(row.clicks)}</td>
                <td className="py-2.5 px-2 text-right text-white/60">{row.ctr.toFixed(2)}%</td>
                <td className="py-2.5 px-2 text-right text-white/60">${row.cpc.toFixed(2)}</td>
                <td className="py-2.5 pl-2 text-right text-white/60">{row.conversions}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
