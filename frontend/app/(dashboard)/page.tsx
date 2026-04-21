'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import {
  DollarSign,
  TrendingUp,
  MousePointer,
  BarChart2,
  AlertTriangle,
  Activity,
  Zap,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { KPICard, KPICardSkeleton } from '@/components/dashboard/KPICard';
import { SuggestionCard } from '@/components/dashboard/SuggestionCard';
import { SpendChart, PerformanceChart } from '@/components/charts/SpendChart';
import { HealthScoreRing } from '@/components/dashboard/HealthScoreRing';
import { api } from '@/lib/api';
import { buildDashboardTotals, normalizeCampaign } from '@/lib/metaCampaigns';
import { useAuthStore } from '@/lib/store';
import { useAdAccount } from '@/context/AdAccountContext';
import { useDateStore, toMetaDateParams } from '@/lib/dateStore';
import {
  formatCurrency,
  formatPercent,
  formatRoas,
  formatRelative,
  getStatusColor,
  cn
} from '@/lib/utils';
import Link from 'next/link';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useCurrencyFormat } from '@/lib/useCurrencyFormat';
import { useCurrencyStore } from '@/lib/currencyStore';

// ✅ FIXED IMPORT (IMPORTANT)
import { connectMetaAds } from '@/lib/connectMeta';

export default function DashboardPage() {
  const { selectedAdAccount, user } = useAuthStore();
  const { selectedAccount } = useAdAccount();
  const { range } = useDateStore();
  const dateParams = toMetaDateParams(range);
  const queryClient = useQueryClient();
  const lastSyncAtRef = useRef(0);
  const queryEnabled = Boolean(user && selectedAdAccount);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['analytics-overview', selectedAdAccount, range],
    queryFn: () => api.analytics.overview({ adAccountId: selectedAdAccount, ...dateParams }),
    select: (r) => r.data.data,
    enabled: queryEnabled,
    refetchOnMount: false,
  });

  const { data: spendData, isLoading: spendLoading } = useQuery({
    queryKey: ['spend-over-time', selectedAdAccount, range],
    queryFn: () => api.analytics.spendOverTime({ adAccountId: selectedAdAccount, ...dateParams }),
    select: (r) => r.data.data,
    enabled: queryEnabled,
    refetchOnMount: false,
  });

  const { data: perfData, isLoading: perfLoading } = useQuery({
    queryKey: ['performance-breakdown', selectedAdAccount, range],
    queryFn: () => api.analytics.performanceBreakdown({ adAccountId: selectedAdAccount, ...dateParams }),
    select: (r) => r.data.data,
    enabled: queryEnabled,
    refetchOnMount: false,
  });

  const { data: liveCampaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ['dashboard-live-campaigns', selectedAdAccount, range],
    queryFn: async () => {
      console.log('📊 [Dashboard] Selected range:', range);
      console.log('📊 [Dashboard] Live campaigns API params:', {
        adAccountId: selectedAdAccount,
        ...dateParams,
      });

      const response = await api.campaigns.metaList({
        adAccountId: selectedAdAccount,
        ...dateParams,
      });
      const campaigns = response?.data?.data?.campaigns || [];

      console.log('📊 [Dashboard] Raw campaigns response:', {
        campaignCount: campaigns.length,
        firstCampaign: campaigns[0],
      });

      if (!Array.isArray(campaigns)) {
        return [];
      }

      const normalized = campaigns.map((c) => {
        const normalized = normalizeCampaign(c);
        console.log('📊 [Dashboard] Normalized campaign:', {
          id: normalized.id,
          name: normalized.name,
          spend: normalized.metrics?.spend,
          roas: normalized.metrics?.roas,
        });
        return normalized;
      });

      return normalized;
    },
    enabled: queryEnabled,
    refetchOnMount: false,
  });

  const kpi = liveCampaigns?.length ? buildDashboardTotals(liveCampaigns) : overview?.kpi;
  
  // Debug KPI calculation
  console.log('📊 [Dashboard] KPI calculation:', {
    hasLiveCampaigns: !!liveCampaigns?.length,
    campaignCount: liveCampaigns?.length || 0,
    kpi: {
      totalSpend: kpi?.totalSpend,
      avgRoas: kpi?.avgRoas,
      avgCtr: kpi?.avgCtr,
      avgCpa: kpi?.avgCpa,
    },
  });
  
  const isMetaConnected = !!user?.metaAuth?.adAccountIds?.length;

  const syncMutation = useMutation({
    mutationFn: (adAccountId: string) => api.campaigns.sync(adAccountId),
    onSuccess: () => {
      lastSyncAtRef.current = Date.now();
      toast.success('Sync started! Data updates in ~30s');

      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['analytics-overview', selectedAdAccount] });
        void queryClient.invalidateQueries({ queryKey: ['spend-over-time', selectedAdAccount] });
        void queryClient.invalidateQueries({ queryKey: ['performance-breakdown', selectedAdAccount] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard-live-campaigns', selectedAdAccount] });
      }, 10000);
    },
    onError: () => {
      toast.error('Sync failed — check Meta connection');
    },
  });

  const handleSync = async () => {
    if (!selectedAdAccount) return;
    if (syncMutation.isPending) {
      return;
    }

    if (Date.now() - lastSyncAtRef.current < 30000) {
      toast('A sync was just requested. Please wait a few seconds.');
      return;
    }

    await syncMutation.mutateAsync(selectedAdAccount);
  };

  const topCampaigns = (liveCampaigns || overview?.topCampaigns || []).slice(0, 5);
  const topAnomalies = overview?.topAnomalies || [];
  const { fmt: fmtCurrency } = useCurrencyFormat();
  // Subscribe directly so this component re-renders on currency change
  useCurrencyStore();

  return (
    <div className="max-w-[1400px] space-y-5 p-4 sm:space-y-6 sm:p-6">
      
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-bold text-white sm:text-xl">
            Good {getGreeting()},{' '}
            <span className="text-gradient">{user?.name?.split(' ')[0]}</span>
          </h1>
          <p className="text-surface-500 text-xs mt-0.5">
            {selectedAccount
              ? `Viewing: ${selectedAccount.name} · ${selectedAccount.id}`
              : 'Connect Meta Ads to get started'}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {isMetaConnected && (
            <button onClick={handleSync} disabled={syncMutation.isPending} className="btn-secondary gap-2 text-xs disabled:opacity-60">
              <RefreshCw size={13} className={syncMutation.isPending ? 'animate-spin' : ''} />
              {syncMutation.isPending ? 'Syncing...' : 'Sync now'}
            </button>
          )}
          {!isMetaConnected && (
            <button onClick={connectMetaAds} className="btn-primary gap-2 text-xs">
              <Zap size={13} />
              Connect Meta Ads
            </button>
          )}
        </div>
      </div>

      {/* Banner */}
      {!isMetaConnected && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="border-gradient rounded-xl p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white mb-1">Connect your Meta Ads account</h3>
              <p className="text-sm text-surface-400">Link your Meta Ads account to start analyzing campaigns.</p>
            </div>
            <button onClick={connectMetaAds} className="btn-primary flex shrink-0 items-center justify-center gap-1 text-xs">
              Connect now <ArrowRight size={12} />
            </button>
          </div>
        </motion.div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overviewLoading || campaignsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <KPICardSkeleton key={i} />)
        ) : (
          <>
            <KPICard
              title="Total Spend"
              value={fmtCurrency(kpi?.totalSpend || 0)}
              icon={DollarSign}
              iconColor="text-violet-400"
              iconBg="bg-violet-500/10"
              gradient="bg-gradient-to-br from-violet-500/5 to-transparent"
              delay={0}
            />
            <KPICard
              title="ROAS"
              value={formatRoas(kpi?.avgRoas || 0)}
              icon={TrendingUp}
              iconColor="text-cyan-400"
              iconBg="bg-cyan-500/10"
              gradient="bg-gradient-to-br from-cyan-500/5 to-transparent"
              delay={0.05}
            />
            <KPICard
              title="CTR"
              value={formatPercent(kpi?.avgCtr || 0)}
              icon={MousePointer}
              iconColor="text-green-400"
              iconBg="bg-green-500/10"
              gradient="bg-gradient-to-br from-green-500/5 to-transparent"
              delay={0.1}
            />
            <KPICard
              title="CPA"
              value={fmtCurrency(kpi?.avgCpa || 0)}
              icon={BarChart2}
              iconColor="text-amber-400"
              iconBg="bg-amber-500/10"
              gradient="bg-gradient-to-br from-amber-500/5 to-transparent"
              delay={0.15}
            />
          </>
        )}
      </div>

      {/* Charts Row */}
      {queryEnabled && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <SpendChart data={spendData || []} isLoading={spendLoading} />
          </div>
          <div className="xl:col-span-1">
            <PerformanceChart data={(perfData || []).slice(0, 10)} isLoading={perfLoading} />
          </div>
        </div>
      )}

      {/* Top Campaigns + Anomalies */}
      {queryEnabled && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Top Campaigns */}
          <div className="xl:col-span-2 card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-white/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Activity size={14} className="text-brand-400" />
                Top Campaigns
              </h3>
              <Link href="/campaigns" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                View all <ArrowRight size={11} />
              </Link>
            </div>
            {topCampaigns.length === 0 ? (
              <div className="p-8 text-center text-surface-500 text-sm">
                No campaigns yet — sync your Meta account to load data
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {topCampaigns.map((c: any, i: number) => {
                  const cNorm = normalizeCampaign(c);
                  return (
                    <Link href={`/campaigns/${cNorm.id}/adsets`} key={cNorm.id}>
                      <div className="flex items-center gap-3 px-4 py-3.5 transition-colors cursor-pointer hover:bg-surface-800/30 sm:px-5">
                        <div className="w-7 h-7 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                          <span className="text-[11px] font-bold text-brand-400">{i + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{cNorm.name}</p>
                          <p className="text-[11px] text-surface-500">{cNorm.status}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium text-white">{fmtCurrency(cNorm.metrics?.spend || 0)}</p>
                          <p className="text-[11px] text-surface-500">ROAS {formatRoas(cNorm.metrics?.roas || 0)}</p>
                        </div>
                        <ArrowRight size={13} className="text-surface-600 shrink-0" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Anomalies */}
          <div className="card p-4 sm:p-5 xl:col-span-1">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <AlertTriangle size={14} className="text-amber-400" />
              Recent Anomalies
            </h3>
            {topAnomalies.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8">
                <Activity size={24} className="text-surface-700" />
                <p className="text-surface-500 text-xs text-center">All campaigns performing within normal ranges</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topAnomalies.slice(0, 5).map((a: any, i: number) => (
                  <div key={i} className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-3">
                    <p className="text-xs font-medium text-white truncate">{a.campaignName}</p>
                    <p className="text-[11px] text-surface-400 mt-0.5 leading-snug">{a.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}