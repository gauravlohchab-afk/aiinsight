'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ChevronRight, Megaphone, MousePointerClick, Search, Filter,
  DollarSign, Users, BarChart2, LayoutGrid, Sparkles, X, Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDateStore, toMetaDateParams } from '@/lib/dateStore';
import { cn, formatCurrency, formatPercent, getStatusColor } from '@/lib/utils';
import { useCurrencyStore } from '@/lib/currencyStore';
import BreakdownCard from '@/components/BreakdownCard';

type StatusFilter = 'all' | 'ACTIVE' | 'PAUSED';

interface AdMetrics {
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

interface AdRow {
  id: string;
  name: string;
  status: string;
  creative: { title?: string; body?: string; imageUrl?: string; callToAction?: string };
  metrics: AdMetrics;
}

interface AdSetAdsResponse {
  adSet: {
    id: string;
    name: string;
    status: string;
    campaign: { id: string; name: string };
    budget: { daily: number | null; lifetime: number | null };
    metrics: AdMetrics;
  };
  ads: AdRow[];
}

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

interface MultiBreakdownResponse {
  gender: BreakdownRow[];
  age: BreakdownRow[];
  platform: BreakdownRow[];
  placement: BreakdownRow[];
}
const METRIC_COLS: { key: keyof AdMetrics; label: string; fmt: (v: number) => string }[] = [
  { key: 'spend', label: 'Spend', fmt: formatCurrency },
  { key: 'impressions', label: 'Impressions', fmt: (v) => v.toLocaleString() },
  { key: 'reach', label: 'Reach', fmt: (v) => v.toLocaleString() },
  { key: 'clicks', label: 'Clicks', fmt: (v) => v.toLocaleString() },
  { key: 'ctr', label: 'CTR', fmt: formatPercent },
  { key: 'cpc', label: 'CPC', fmt: formatCurrency },
  { key: 'cpm', label: 'CPM', fmt: formatCurrency },
  { key: 'conversions', label: 'Conv.', fmt: (v) => v.toFixed(0) },
  { key: 'cpa', label: 'Cost/Lead', fmt: formatCurrency },
];

export default function AdSetAdsPage() {
  const router = useRouter();
  const { adsetId } = useParams<{ adsetId: string }>();
  // Subscribe to currency store so values re-render when currency changes
  useCurrencyStore();
  const { range } = useDateStore();
  const dateParams = toMetaDateParams(range);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showImprovements, setShowImprovements] = useState(false);

  const { data, isLoading, error } = useQuery<AdSetAdsResponse>({
    queryKey: ['adset-ads', adsetId, range],
    queryFn: async () => (await api.adsets.ads(adsetId, dateParams)).data.data,
    enabled: Boolean(adsetId),
  });

  const { data: breakdownData, isLoading: breakdownLoading } = useQuery<MultiBreakdownResponse>({
    queryKey: ['adset-breakdowns', adsetId, range],
    queryFn: async () => (await api.adsets.breakdowns(adsetId, dateParams)).data.data,
    enabled: Boolean(adsetId),
  });

  const improvementsMutation = useMutation({
    mutationFn: (metrics: { spend: number; ctr: number; conversions: number; adsetId: string }) =>
      api.ai.improvements({
        adsetId: metrics.adsetId,
        metrics: { spend: metrics.spend, ctr: metrics.ctr, conversions: metrics.conversions },
      }),
  });

  const breakdownCards = useMemo(
    () => [
      { key: 'gender', title: 'Gender', data: breakdownData?.gender || [] },
      { key: 'age', title: 'Age', data: breakdownData?.age || [] },
      { key: 'platform', title: 'Platform', data: breakdownData?.platform || [] },
      { key: 'placement', title: 'Placement', data: breakdownData?.placement || [] },
    ],
    [breakdownData]
  );

  const adSet = data?.adSet;
  const ads = (data?.ads || []).filter((a) => {
    const matchSearch = search ? a.name.toLowerCase().includes(search.toLowerCase()) : true;
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalSpend = ads.reduce((s, a) => s + (a.metrics.spend || 0), 0);
  const totalImpressions = ads.reduce((s, a) => s + (a.metrics.impressions || 0), 0);
  const totalConversions = ads.reduce((s, a) => s + (a.metrics.conversions || 0), 0);
  const avgCTR = ads.length ? ads.reduce((s, a) => s + (a.metrics.ctr || 0), 0) / ads.length : 0;

  return (
    <div className="p-6 max-w-[1600px] space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-surface-500">
        <Link href="/" className="hover:text-white transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <Link href="/campaigns" className="hover:text-white transition-colors">Campaigns</Link>
        <ChevronRight size={12} />
        <Link href={`/campaigns/${adSet?.campaign.id || ''}/adsets`} className="hover:text-white transition-colors">
          {adSet?.campaign.name || 'Campaign'}
        </Link>
        <ChevronRight size={12} />
        <span className="text-surface-300">{adSet?.name || 'Ad Set'}</span>
        <ChevronRight size={12} />
        <span className="text-white font-medium">Ads</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Megaphone size={18} className="text-brand-400" />
            <h1 className="text-xl font-bold text-white">Ads</h1>
            {adSet?.status && (
              <span className={cn('badge text-[10px]', getStatusColor(adSet.status))}>{adSet.status}</span>
            )}
          </div>
          <p className="text-surface-400 text-sm">{adSet?.name} · {ads.length} ad{ads.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={async () => {
            setShowImprovements(true);
            if (!improvementsMutation.data) {
              await improvementsMutation.mutateAsync({ spend: totalSpend, ctr: avgCTR, conversions: totalConversions, adsetId });
            }
          }}
          className="btn-primary text-xs gap-2 flex items-center"
        >
          <Sparkles size={13} />
          Improve Performance
        </button>
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
            placeholder="Search ads…"
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
          <Filter size={11} /> {ads.length} result{ads.length !== 1 ? 's' : ''} — click a row to view details
        </span>
      </div>

      {/* Table */}
      {error ? (
        <div className="card p-8 text-sm text-red-400">Failed to load ads. Check your Meta connection.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase min-w-[220px]">Ad</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase min-w-[200px]">Creative</th>
                  {METRIC_COLS.map((c) => (
                    <th key={c.key} className="text-right px-4 py-3 text-xs font-medium text-surface-500 uppercase whitespace-nowrap">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 12 }).map((__, j) => (
                          <td key={j} className="px-4 py-3.5"><div className="skeleton h-4 w-full rounded" /></td>
                        ))}
                      </tr>
                    ))
                  : ads.map((ad) => (
                      <tr
                        key={ad.id}
                        onClick={() => router.push(`/ads/${ad.id}`)}
                        className="cursor-pointer hover:bg-surface-800/40 transition-colors group"
                      >
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-white group-hover:text-brand-300 transition-colors truncate max-w-[200px]">{ad.name}</p>
                          <p className="text-[10px] font-mono text-surface-600 mt-0.5">{ad.id}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={cn('badge text-[10px]', getStatusColor(ad.status))}>{ad.status}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-xs text-white truncate max-w-[180px]">{ad.creative.title || 'Untitled'}</p>
                          <p className="text-[10px] text-surface-500 truncate mt-0.5">{ad.creative.callToAction || ad.creative.body || '—'}</p>
                        </td>
                        {METRIC_COLS.map((col) => (
                          <td key={col.key} className="px-4 py-3.5 text-right tabular-nums text-white whitespace-nowrap">
                            {col.fmt(ad.metrics[col.key] || 0)}
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {!isLoading && ads.length === 0 && (
            <div className="p-10 text-center">
              <MousePointerClick size={20} className="text-surface-600 mx-auto mb-3" />
              <p className="text-sm text-surface-400">No ads match your filters.</p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <LayoutGrid size={15} className="text-brand-300" />
          <h2 className="text-sm font-semibold text-white">Audience Breakdowns</h2>
          <span className="text-xs text-surface-500">Gender, age, platform, and placement together</span>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {breakdownCards.map((card) => (
            <BreakdownCard
              key={card.key}
              title={card.title}
              data={card.data}
              isLoading={breakdownLoading}
            />
          ))}
        </div>
      </div>

      {/* Improvements Modal */}
      {showImprovements && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowImprovements(false)}>
          <div className="relative w-full max-w-lg rounded-2xl bg-surface-900 border border-white/10 shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                  <Sparkles size={14} className="text-brand-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Improvement Suggestions</h3>
                  <p className="text-xs text-surface-500">{adSet?.name}</p>
                </div>
              </div>
              <button onClick={() => setShowImprovements(false)} className="text-surface-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            {improvementsMutation.isPending && (
              <div className="flex flex-col items-center gap-3 py-10">
                <Loader2 size={24} className="animate-spin text-brand-400" />
                <p className="text-sm text-surface-400">Analyzing performance…</p>
              </div>
            )}

            {improvementsMutation.isError && (
              <p className="text-sm text-red-400 py-6 text-center">Failed to load suggestions. Please try again.</p>
            )}

            {improvementsMutation.data && (
              <div className="space-y-3">
                {(improvementsMutation.data?.data?.data?.suggestions || []).map((s: string, i: number) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl bg-surface-800/60 border border-white/5 p-4">
                    <div className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-brand-400">{i + 1}</span>
                    </div>
                    <p className="text-sm text-surface-200 leading-relaxed">{s}</p>
                  </div>
                ))}
                <p className="text-[10px] text-surface-600 text-center pt-2">
                  Powered by AI · Based on current ad performance metrics
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
