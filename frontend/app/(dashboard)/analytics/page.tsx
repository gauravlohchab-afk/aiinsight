'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, BarChart2, Calendar, Sparkles, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import BreakdownCard from '@/components/BreakdownCard';
import { BreakdownPieChart, PerformanceChart, SpendChart } from '@/components/charts/SpendChart';
import { api } from '@/lib/api';
import { useDateStore, toMetaDateParams, DatePreset } from '@/lib/dateStore';
import { useAuthStore } from '@/lib/store';
import { cn, formatCurrency, formatPercent, formatRelative } from '@/lib/utils';
import { useCurrencyStore } from '@/lib/currencyStore';

// Maps a date preset to spend-over-time granularity days
function daysFromPreset(preset: DatePreset | null): number {
  switch (preset) {
    case 'today':
    case 'yesterday': return 1;
    case 'last_7d': return 7;
    case 'last_14d': return 14;
    case 'last_30d': return 30;
    case 'this_month': return 31;
    case 'last_month': return 31;
    case 'maximum': return 90;
    default: return 30;
  }
}

const DATE_PRESETS: { label: string; preset: DatePreset }[] = [
  { label: '7D',  preset: 'last_7d'  },
  { label: '14D', preset: 'last_14d' },
  { label: '30D', preset: 'last_30d' },
  { label: '90D', preset: 'maximum'  },
];

export default function AnalyticsPage() {
  const { selectedAdAccount } = useAuthStore();
  // Subscribe to currency store so values re-render when currency changes
  useCurrencyStore();
  const { range, setPreset } = useDateStore();
  const queryEnabled = Boolean(selectedAdAccount);
  const dateParams = toMetaDateParams(range);
  // Derive granularity days from the selected preset — no separate state needed
  const days = daysFromPreset(range.preset);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['analytics-overview', selectedAdAccount, range],
    queryFn: async () => {
      const res = await api.analytics.overview({ adAccountId: selectedAdAccount, ...dateParams });
      return res.data.data;
    },
    enabled: queryEnabled,
  });

  const { data: spendData, isLoading: spendLoading } = useQuery({
    queryKey: ['spend-over-time', selectedAdAccount, range, days],
    queryFn: async () => {
      const res = await api.analytics.spendOverTime({ adAccountId: selectedAdAccount, days, ...dateParams });
      return res.data.data || [];
    },
    select: (rows: any[]) => rows.map((item) => ({
      date: item.date,
      spend: Number(item.spend || 0),
      ctr: Number(item.ctr || 0),
      conversions: Number(item.conversions || 0),
    })),
    enabled: queryEnabled,
  });

  const { data: perfData, isLoading: perfLoading } = useQuery({
    queryKey: ['performance-breakdown', selectedAdAccount, range],
    queryFn: async () => {
      const res = await api.analytics.performanceBreakdown({ adAccountId: selectedAdAccount, ...dateParams });
      const d = res.data?.data;
      return Array.isArray(d) ? d : [];
    },
    enabled: queryEnabled,
  });

  const { data: breakdowns, isLoading: breakdownsLoading } = useQuery({
    queryKey: ['analytics-breakdowns', selectedAdAccount, range],
    queryFn: async () => {
      const res = await api.analytics.breakdowns({ adAccountId: selectedAdAccount, ...dateParams });
      return res.data.data;
    },
    enabled: queryEnabled,
  });

  const { data: anomalies, isLoading: anomaliesLoading } = useQuery({
    queryKey: ['anomalies', selectedAdAccount],
    queryFn: async () => {
      const res = await api.analytics.anomalies();
      return res.data.data || [];
    },
    enabled: queryEnabled,
  });

  const { data: fatigue, isLoading: fatigueLoading } = useQuery({
    queryKey: ['creative-fatigue', selectedAdAccount],
    queryFn: async () => {
      const res = await api.analytics.creativeFatigue();
      return res.data.data || [];
    },
    enabled: queryEnabled,
  });

  const isLoading = overviewLoading || spendLoading || perfLoading || breakdownsLoading || anomaliesLoading || fatigueLoading;
  const kpi = overview?.kpi || {};
  const hasData = !isLoading && (
    Boolean(kpi.totalSpend) ||
    (spendData?.length || 0) > 0 ||
    (perfData?.length || 0) > 0 ||
    (breakdowns?.gender?.length || 0) > 0 ||
    (anomalies?.length || 0) > 0 ||
    (fatigue?.length || 0) > 0
  );

  const breakdownCards = [
    { key: 'gender', title: 'Gender', data: breakdowns?.gender || [] },
    { key: 'age', title: 'Age', data: breakdowns?.age || [] },
    { key: 'platform', title: 'Platform', data: breakdowns?.platform || [] },
    { key: 'placement', title: 'Placement', data: breakdowns?.placement || [] },
  ];

  const topCards = [
    { label: 'Total Spend', value: formatCurrency(Number(kpi.totalSpend || 0)), note: 'Across selected range' },
    { label: 'Avg CTR', value: formatPercent(Number(kpi.avgCtr || 0)), note: 'Click-through rate' },
    { label: 'Conversions', value: Math.round(Number(kpi.totalConversions || 0)).toString(), note: 'All tracked outcomes' },
    { label: 'CPA', value: formatCurrency(Number(kpi.avgCpa || 0)), note: 'Average cost per acquisition' },
  ];

  if (!selectedAdAccount) {
    return (
      <div className="max-w-[1400px] p-4 sm:p-6">
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-brand-500/20 bg-brand-500/10">
            <BarChart2 size={28} className="text-brand-400" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-white">Select an Ad Account</h2>
          <p className="max-w-sm text-sm text-surface-400">
            Choose an ad account to load the dashboard, breakdown charts, and AI-style trend views.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-[1400px] p-4 sm:p-6">
        <div className="card flex flex-col items-center justify-center p-12">
          <div className="relative mb-4 h-16 w-16">
            <div className="absolute inset-0 animate-ping rounded-full bg-brand-500/20" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/10">
              <BarChart2 size={24} className="text-brand-400" />
            </div>
          </div>
          <p className="font-medium text-white">Loading analytics data…</p>
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="max-w-[1400px] p-4 sm:p-6">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <BarChart2 size={20} className="text-brand-400" />
            Analytics
          </h1>
          <p className="mt-0.5 text-sm text-surface-400">Deep-dive performance analysis across all campaigns</p>
        </div>

        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10">
            <BarChart2 size={28} className="text-blue-400" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-white">No Analytics Data Available</h2>
          <p className="mb-6 max-w-sm text-sm text-surface-400">
            Start running campaigns to see spend, CTR, conversions, campaign comparisons, and full audience breakdowns.
          </p>
          <div className="space-y-2 text-sm text-surface-400">
            <p>✓ Create campaigns in Meta Ads</p>
            <p>✓ Connect your Meta account</p>
            <p>✓ Wait for sync to complete</p>
            <p>✓ Return to view the full dashboard</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] space-y-5 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
            <BarChart2 size={20} className="text-brand-400" />
            Analytics
          </h1>
          <p className="mt-0.5 text-sm text-surface-400">Professional Meta-style analysis across trends, campaigns, and audience segments</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Calendar size={14} className="text-surface-500" />
          <div className="flex max-w-full items-center overflow-x-auto rounded-lg border border-white/5 bg-surface-950 p-1">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.preset}
                onClick={() => setPreset(preset.preset)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-all',
                  range.preset === preset.preset ? 'bg-brand-500/20 text-brand-300' : 'text-surface-400 hover:text-white'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(91,140,255,0.22),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(61,217,184,0.14),_transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] p-4 shadow-[0_32px_100px_rgba(2,6,23,0.45)] sm:rounded-[32px] sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-brand-300">
              <Sparkles size={12} />
              Meta-style intelligence layer
            </div>
            <h2 className="text-xl font-semibold text-white sm:text-2xl">Smooth trend curves, campaign comparison, and audience distribution in one unified analytics view.</h2>
            <p className="mt-2 text-sm leading-6 text-surface-400">
              Hoverable charts, animated cards, and always-visible breakdowns make it easier to understand spend efficiency and performance shifts.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[420px]">
            {topCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.18em] text-surface-500">{card.label}</p>
                <p className="mt-2 text-xl font-semibold text-white sm:text-2xl">{card.value}</p>
                <p className="mt-1 text-xs text-surface-500">{card.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SpendChart
          data={spendData || []}
          isLoading={spendLoading}
          title="Performance Over Time"
          subtitle="Spend, CTR, and conversions with smooth curves and shared hover insights"
        />
        <PerformanceChart
          data={(perfData || []).map((item: any) => ({
            name: item.name,
            spend: Number(item.spend || 0),
            conversions: Number(item.conversions || 0),
            ctr: Number(item.ctr || 0),
          }))}
          isLoading={perfLoading}
          title="Campaign Comparison"
          subtitle="Spend versus conversion output across your top campaigns"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BreakdownPieChart title="Gender Breakdown" data={breakdowns?.gender || []} isLoading={breakdownsLoading} />
        <BreakdownPieChart title="Platform Breakdown" data={breakdowns?.platform || []} isLoading={breakdownsLoading} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={15} className="text-brand-300" />
          <h2 className="text-sm font-semibold text-white">All Breakdowns</h2>
          <span className="text-xs text-surface-500">Gender, age, platform, and placement visible together</span>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {breakdownCards.map((card) => (
            <BreakdownCard key={card.key} title={card.title} data={card.data} isLoading={breakdownsLoading} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <AlertTriangle size={14} className="text-amber-400" />
              Anomaly Feed
            </h3>
            {anomalies?.length > 0 && (
              <span className="badge bg-amber-500/10 text-[10px] text-amber-400">
                {anomalies.length} active
              </span>
            )}
          </div>

          {anomalies?.length > 0 ? (
            <div className="max-h-[280px] space-y-2 overflow-y-auto">
              {anomalies.map((item: any, index: number) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3',
                    item.type === 'spike' ? 'border-red-500/15 bg-red-500/5' : 'border-amber-500/15 bg-amber-500/5'
                  )}
                >
                  <div className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                    item.type === 'spike' ? 'bg-red-500/15' : 'bg-amber-500/15'
                  )}>
                    <AlertTriangle size={12} className={item.type === 'spike' ? 'text-red-400' : 'text-amber-400'} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-medium text-white">{item.campaignName}</p>
                      <span className={cn(
                        'badge shrink-0 text-[10px]',
                        item.type === 'spike' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                      )}>
                        {item.percentage}% {item.type}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs leading-snug text-surface-400">{item.message}</p>
                    <p className="mt-1 text-[10px] text-surface-600">{formatRelative(item.detectedAt)}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-3">
              <Activity size={28} className="text-surface-700" />
              <p className="text-sm text-surface-500">No anomalies detected</p>
              <p className="text-xs text-surface-700">All campaigns are performing within normal ranges</p>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">Range Snapshot</h3>
          <div className="space-y-3">
            {[
              { label: 'Active Campaigns', value: Math.round(Number(kpi.activeCampaigns || 0)).toString() },
              { label: 'Impressions', value: Math.round(Number(kpi.totalImpressions || 0)).toLocaleString() },
              { label: 'Clicks', value: Math.round(Number(kpi.totalClicks || 0)).toLocaleString() },
              { label: 'Revenue', value: formatCurrency(Number(kpi.totalRevenue || 0)) },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-3 py-3 text-sm">
                <span className="text-surface-400">{item.label}</span>
                <span className="font-medium text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {fatigue?.length > 0 && (
        <div className="card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <TrendingDown size={14} className="text-red-400" />
            Creative Fatigue Detected
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {fatigue.map((ad: any, index: number) => (
              <div key={index} className="rounded-xl border border-red-500/10 bg-surface-950 p-3.5">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-red-500/10">
                    <TrendingDown size={12} className="text-red-400" />
                  </div>
                  <p className="truncate text-xs font-medium text-white">{ad.name}</p>
                </div>
                <p className="text-xs text-surface-400">
                  CTR declined <span className="font-medium text-red-400">{ad.creativeFatigue?.ctrDeclinePercentage}%</span>
                </p>
                <p className="mt-1 text-[10px] text-surface-600">Detected {formatRelative(ad.creativeFatigue?.detectedAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
