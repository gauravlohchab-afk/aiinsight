'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight, Layers3, Target, Search, Filter,
  DollarSign, MousePointerClick, Users, BarChart2, Layers,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDateStore, toMetaDateParams } from '@/lib/dateStore';
import { cn, formatCurrency, formatPercent, getStatusColor } from '@/lib/utils';
import BreakdownSelector, { BreakdownOption } from '@/components/BreakdownSelector';
import BreakdownTable from '@/components/BreakdownTable';

type StatusFilter = 'all' | 'ACTIVE' | 'PAUSED';

interface AdSetMetrics {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  cpa: number;
  roas: number;
  frequency: number;
}

interface AdSetRow {
  id: string;
  name: string;
  status: string;
  budget: { daily: number | null; lifetime: number | null };
  metrics: AdSetMetrics;
}

interface CampaignAdSetsResponse {
  campaign: { id: string; name: string; status: string; objective?: string };
  adsets: AdSetRow[];
}

const METRIC_COLS: { key: keyof AdSetMetrics; label: string; fmt: (v: number) => string }[] = [
  { key: 'spend', label: 'Spend', fmt: formatCurrency },
  { key: 'impressions', label: 'Impressions', fmt: (v) => v.toLocaleString() },
  { key: 'reach', label: 'Reach', fmt: (v) => v.toLocaleString() },
  { key: 'clicks', label: 'Clicks', fmt: (v) => v.toLocaleString() },
  { key: 'ctr', label: 'CTR', fmt: formatPercent },
  { key: 'cpc', label: 'CPC', fmt: formatCurrency },
  { key: 'cpm', label: 'CPM', fmt: formatCurrency },
  { key: 'conversions', label: 'Conv.', fmt: (v) => v.toFixed(0) },
  { key: 'cpa', label: 'Cost/Lead', fmt: formatCurrency },
  { key: 'frequency', label: 'Freq.', fmt: (v) => v.toFixed(2) },
];

export default function CampaignAdSetsPage() {
  const router = useRouter();
  const { campaignId } = useParams<{ campaignId: string }>();
  const { range } = useDateStore();
  const dateParams = toMetaDateParams(range);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [breakdown, setBreakdown] = useState<BreakdownOption>('none');

  const { data: breakdownData, isLoading: breakdownLoading } = useQuery({
    queryKey: ['campaign-breakdown', campaignId, breakdown, range],
    queryFn: async () =>
      (await api.campaigns.breakdown(campaignId, { breakdown, ...dateParams })).data.data,
    enabled: Boolean(campaignId) && breakdown !== 'none',
  });

  const { data, isLoading, error } = useQuery<CampaignAdSetsResponse>({
    queryKey: ['campaign-adsets', campaignId, range],
    queryFn: async () => (await api.campaigns.adsets(campaignId, dateParams)).data.data,
    enabled: Boolean(campaignId),
  });

  const campaign = data?.campaign;
  const adsets = (data?.adsets || []).filter((a) => {
    const matchSearch = search ? a.name.toLowerCase().includes(search.toLowerCase()) : true;
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalSpend = adsets.reduce((s, a) => s + (a.metrics.spend || 0), 0);
  const totalImpressions = adsets.reduce((s, a) => s + (a.metrics.impressions || 0), 0);
  const totalConversions = adsets.reduce((s, a) => s + (a.metrics.conversions || 0), 0);
  const avgCTR = adsets.length ? adsets.reduce((s, a) => s + (a.metrics.ctr || 0), 0) / adsets.length : 0;

  return (
    <div className="p-6 max-w-[1600px] space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-surface-500">
        <Link href="/" className="hover:text-white transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <Link href="/campaigns" className="hover:text-white transition-colors">Campaigns</Link>
        <ChevronRight size={12} />
        <span className="text-surface-300">{campaign?.name || 'Campaign'}</span>
        <ChevronRight size={12} />
        <span className="text-white font-medium">Ad Sets</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers3 size={18} className="text-brand-400" />
            <h1 className="text-xl font-bold text-white">Ad Sets</h1>
            {campaign?.status && (
              <span className={cn('badge text-[10px]', getStatusColor(campaign.status))}>{campaign.status}</span>
            )}
          </div>
          <p className="text-surface-400 text-sm">{campaign?.name} · {adsets.length} ad set{adsets.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Summary Cards */}
      {!error && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Spend', value: formatCurrency(totalSpend), icon: DollarSign, color: 'text-brand-400' },
            { label: 'Impressions', value: totalImpressions.toLocaleString(), icon: BarChart2, color: 'text-cyan-400' },
            { label: 'Avg CTR', value: formatPercent(avgCTR), icon: MousePointerClick, color: 'text-amber-400' },
            { label: 'Conversions', value: totalConversions.toFixed(0), icon: Users, color: 'text-green-400' },
          ].map((c) => (
            <div key={c.label} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-surface-400 uppercase tracking-wider">{c.label}</p>
                <c.icon size={14} className={c.color} />
              </div>
              {isLoading
                ? <div className="skeleton h-6 w-20 rounded" />
                : <p className="text-xl font-bold text-white">{c.value}</p>
              }
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            placeholder="Search ad sets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 text-xs w-56"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-surface-950 border border-white/5 rounded-lg">
          {(['all', 'ACTIVE', 'PAUSED'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                statusFilter === s ? 'bg-surface-800 text-white' : 'text-surface-500 hover:text-white'
              )}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-surface-500">
          <Filter size={11} /> {adsets.length} result{adsets.length !== 1 ? 's' : ''}
        </span>
        <BreakdownSelector value={breakdown} onChange={setBreakdown} />
      </div>

      {/* Table */}
      {error ? (
        <div className="card p-8 text-sm text-red-400">Failed to load ad sets. Check your Meta connection.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase min-w-[220px]">Ad Set</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-surface-500 uppercase">Budget</th>
                  {METRIC_COLS.map((c) => (
                    <th key={c.key} className="text-right px-4 py-3 text-xs font-medium text-surface-500 uppercase whitespace-nowrap">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 13 }).map((__, j) => (
                          <td key={j} className="px-4 py-3.5"><div className="skeleton h-4 w-full rounded" /></td>
                        ))}
                      </tr>
                    ))
                  : adsets.map((adSet) => (
                      <tr
                        key={adSet.id}
                        onClick={() => router.push(`/adsets/${adSet.id}/ads`)}
                        className="cursor-pointer hover:bg-surface-800/40 transition-colors group"
                      >
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-white group-hover:text-brand-300 transition-colors truncate max-w-[200px]">{adSet.name}</p>
                          <p className="text-[10px] font-mono text-surface-600 mt-0.5">{adSet.id}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={cn('badge text-[10px]', getStatusColor(adSet.status))}>{adSet.status}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-white whitespace-nowrap">
                          {adSet.budget.daily != null
                            ? `${formatCurrency(adSet.budget.daily)}/d`
                            : adSet.budget.lifetime != null
                              ? formatCurrency(adSet.budget.lifetime)
                              : '—'}
                        </td>
                        {METRIC_COLS.map((col) => (
                          <td key={col.key} className="px-4 py-3.5 text-right tabular-nums text-white whitespace-nowrap">
                            {col.fmt(adSet.metrics[col.key] || 0)}
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {!isLoading && adsets.length === 0 && (
            <div className="p-10 text-center">
              <Target size={20} className="text-surface-600 mx-auto mb-3" />
              <p className="text-sm text-surface-400">No ad sets match your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Breakdown Section */}
      {breakdown !== 'none' && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-violet-400" />
            <span className="text-sm font-semibold text-white capitalize">{breakdown} Breakdown</span>
            <span className="text-xs text-surface-500">— Campaign level</span>
          </div>
          <BreakdownTable data={breakdownData || []} isLoading={breakdownLoading} />
        </div>
      )}
    </div>
  );
}
