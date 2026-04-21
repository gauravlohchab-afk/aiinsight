'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, Filter, RefreshCw, TrendingUp, AlertTriangle, Target } from 'lucide-react';
import { HealthScoreRing } from '@/components/dashboard/HealthScoreRing';
import { api } from '@/lib/api';
import { toMetaDateParams, useDateStore } from '@/lib/dateStore';
import { matchesStatusFilter, normalizeCampaign, sortCampaigns } from '@/lib/metaCampaigns';
import { useAuthStore } from '@/lib/store';
import { useCurrencyStore } from '@/lib/currencyStore';
import {
  formatCurrency, formatPercent, formatRoas,
  getStatusColor, cn, formatRelative
} from '@/lib/utils';
import toast from 'react-hot-toast';

type SortField = 'healthScore' | 'spend' | 'roas' | 'ctr' | 'name';
type StatusFilter = 'all' | 'ACTIVE' | 'PAUSED';

export default function CampaignsPage() {
  const router = useRouter();
  const { selectedAdAccount } = useAuthStore();
  // Subscribe to currency store so values re-render when currency changes
  useCurrencyStore();
  const { range } = useDateStore();
  const dateParams = toMetaDateParams(range);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortField>('healthScore');
  const [page, setPage] = useState(1);
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const queryEnabled = Boolean(selectedAdAccount);

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', selectedAdAccount, statusFilter, sort, page, range],
    queryFn: async () => {
      // Try to fetch live campaigns from Meta first
      try {
        const metaResponse = await api.campaigns.metaList({
          adAccountId: selectedAdAccount,
          ...dateParams,
        });

        const metaCampaigns = metaResponse?.data?.data?.campaigns || [];

        if (Array.isArray(metaCampaigns)) {
          const normalizedCampaigns = sortCampaigns(
            metaCampaigns.map(normalizeCampaign),
            sort
          );

          return {
            campaigns: normalizedCampaigns,
            pagination: {
              total: normalizedCampaigns.length,
              page: 1,
              limit: 50,
              pages: 1,
            },
          };
        }
      } catch (err) {
        console.warn('Failed to fetch live campaigns from Meta, falling back to database');
      }

      // Fall back to database campaigns
      const dbResponse = await api.campaigns.list({
        adAccountId: selectedAdAccount,
        status: statusFilter === 'all' ? undefined : statusFilter,
        sort,
        order: 'desc',
        page,
        limit: 20,
      });

      return dbResponse?.data?.data || { campaigns: [], pagination: { total: 0, page: 1, limit: 20, pages: 1 } };
    },
    enabled: queryEnabled,
    refetchOnMount: false,
  });

  const syncMutation = useMutation({
    mutationFn: (adAccountId: string) => api.campaigns.sync(adAccountId),
    onSuccess: () => {
      setLastSyncAt(Date.now());
      toast.success('Sync queued!');

      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['campaigns', selectedAdAccount] });
      }, 10000);
    },
    onError: () => {
      toast.error('Sync failed');
    },
  });

  const filteredCampaigns = (data?.campaigns || []).filter((campaign: any) => {
    const normalizedCampaign = normalizeCampaign(campaign);
    const matchesSearch = search
      ? normalizedCampaign.name.toLowerCase().includes(search.toLowerCase())
      : true;

    return matchesSearch && matchesStatusFilter(normalizedCampaign.status, statusFilter);
  });

  const handleSync = async () => {
    if (!selectedAdAccount) return;
    if (syncMutation.isPending) {
      return;
    }

    if (Date.now() - lastSyncAt < 30000) {
      toast('A sync was just requested. Please wait a few seconds.');
      return;
    }

    await syncMutation.mutateAsync(selectedAdAccount);
  };

  return (
    <div className="max-w-[1400px] p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
            <Target size={20} className="text-brand-400" />
            Campaigns
          </h1>
          <p className="text-surface-400 text-sm mt-0.5">
            {filteredCampaigns.length} campaigns · sorted by {sort}
          </p>
        </div>
        <button onClick={handleSync} disabled={syncMutation.isPending} className="btn-secondary text-xs gap-2 disabled:opacity-60">
          <RefreshCw size={13} className={syncMutation.isPending ? 'animate-spin' : ''} />
          {syncMutation.isPending ? 'Syncing...' : 'Sync'}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative flex-1 xl:max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            placeholder="Search campaigns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-white/5 bg-surface-950 p-1">
          {(['all', 'ACTIVE', 'PAUSED'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                statusFilter === s
                  ? 'bg-surface-800 text-white'
                  : 'text-surface-500 hover:text-white'
              )}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Filter size={13} className="text-surface-500" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortField)}
            className="bg-surface-900 border border-white/10 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          >
            <option value="healthScore">Health Score</option>
            <option value="spend">Spend</option>
            <option value="roas">ROAS</option>
            <option value="ctr">CTR</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {/* Campaign Table */}
      <div className="card overflow-hidden">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider w-[300px]">
                  Campaign
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Health
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Spend
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">
                  ROAS
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">
                  CTR
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">
                  CPA
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Conversions
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Alerts
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3.5">
                          <div className="skeleton h-4 rounded w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filteredCampaigns.map((campaign: any) => {
                    const campaignIdentifier = campaign.id || campaign._id;

                    return (
                      <tr
                        key={campaignIdentifier}
                        onClick={() => router.push(`/campaigns/${campaignIdentifier}/adsets`)}
                        className="hover:bg-surface-800/40 transition-colors cursor-pointer group"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="text-sm text-white font-medium group-hover:text-brand-300 transition-colors truncate max-w-[220px]">
                                {campaign.name}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={cn('badge text-[10px]', getStatusColor(campaign.status))}>
                                  {campaign.status}
                                </span>
                                <span className="text-[10px] text-surface-600">
                                  {campaign.objective}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <HealthScoreRing score={campaign.healthScore || 0} size="sm" />
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-sm text-white tabular-nums">
                            {formatCurrency(campaign.metrics?.spend || 0)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className={cn(
                            'text-sm tabular-nums font-medium',
                            (campaign.metrics?.roas || 0) >= 2
                              ? 'text-accent-green'
                              : (campaign.metrics?.roas || 0) >= 1
                              ? 'text-accent-amber'
                              : 'text-accent-red'
                          )}>
                            {formatRoas(campaign.metrics?.roas || 0)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-sm text-white tabular-nums">
                            {formatPercent(campaign.metrics?.ctr || 0)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-sm text-white tabular-nums">
                            {formatCurrency(campaign.metrics?.cpa || 0)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-sm text-white tabular-nums">
                            {campaign.metrics?.conversions?.toFixed(0) || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {(campaign.anomalies?.length || 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                              <AlertTriangle size={11} />
                              {campaign.anomalies.length}
                            </span>
                          ) : (
                            <span className="text-xs text-surface-700">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!isLoading && filteredCampaigns.length > 0 && (
          <div className="space-y-3 p-3 md:hidden">
            {filteredCampaigns.map((campaign: any) => {
              const campaignIdentifier = campaign.id || campaign._id;

              return (
                <button
                  key={campaignIdentifier}
                  onClick={() => router.push(`/campaigns/${campaignIdentifier}/adsets`)}
                  className="w-full rounded-2xl border border-white/5 bg-surface-900/50 p-4 text-left"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{campaign.name}</p>
                      <p className="mt-1 text-[11px] text-surface-500">{campaign.objective}</p>
                    </div>
                    <span className={cn('badge text-[10px]', getStatusColor(campaign.status))}>{campaign.status}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-surface-800/50 p-3">
                      <p className="text-[10px] text-surface-500">Spend</p>
                      <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(campaign.metrics?.spend || 0)}</p>
                    </div>
                    <div className="rounded-xl bg-surface-800/50 p-3">
                      <p className="text-[10px] text-surface-500">ROAS</p>
                      <p className="mt-1 text-sm font-semibold text-white">{formatRoas(campaign.metrics?.roas || 0)}</p>
                    </div>
                    <div className="rounded-xl bg-surface-800/50 p-3">
                      <p className="text-[10px] text-surface-500">CTR</p>
                      <p className="mt-1 text-sm font-semibold text-white">{formatPercent(campaign.metrics?.ctr || 0)}</p>
                    </div>
                    <div className="rounded-xl bg-surface-800/50 p-3">
                      <p className="text-[10px] text-surface-500">Health</p>
                      <div className="mt-1">
                        <HealthScoreRing score={campaign.healthScore || 0} size="sm" />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!isLoading && filteredCampaigns.length === 0 && (
          <div className="text-center py-16">
            <Target size={32} className="mx-auto text-surface-700 mb-3" />
            <p className="text-surface-400 text-sm">No campaigns found</p>
            <p className="text-surface-600 text-xs mt-1">
              {search ? 'Try adjusting your search' : 'Sync your Meta Ads account to see campaigns'}
            </p>
          </div>
        )}

        {/* Pagination */}
        {data?.pagination && data.pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <span className="text-xs text-surface-500">
              Page {data.pagination.page} of {data.pagination.pages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-ghost text-xs py-1.5 px-3 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pagination.pages, p + 1))}
                disabled={page === data.pagination.pages}
                className="btn-ghost text-xs py-1.5 px-3 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
