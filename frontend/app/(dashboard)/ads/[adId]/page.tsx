'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight, Megaphone, DollarSign, MousePointerClick,
  Users, BarChart2, Layers, Mail, Phone, Globe, Calendar,
  ExternalLink, ArrowLeft,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDateStore, toMetaDateParams } from '@/lib/dateStore';
import { cn, formatCurrency, formatPercent, getStatusColor } from '@/lib/utils';
import BreakdownSelector, { BreakdownOption } from '@/components/BreakdownSelector';
import BreakdownTable from '@/components/BreakdownTable';

interface AdDetail {
  id: string;
  name: string;
  status: string;
  adSetId: string;
  campaignId: string;
  adSet: { id: string; name: string } | null;
  campaign: { id: string; name: string } | null;
  creative: {
    title: string;
    body: string;
    imageUrl: string;
    videoId: string;
    callToAction: string;
    objectUrl: string;
  };
  metrics: {
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
  };
}

interface Lead {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  adName: string;
  adSetName: string;
  campaignName: string;
  rawFields: Record<string, string>;
}

export default function AdDetailPage() {
  const { adId } = useParams<{ adId: string }>();
  const { range } = useDateStore();
  const dateParams = toMetaDateParams(range);
  const [breakdown, setBreakdown] = useState<BreakdownOption>('none');
  const [showAllLeadFields, setShowAllLeadFields] = useState<Record<string, boolean>>({});

  const { data: adData, isLoading: adLoading, error: adError } = useQuery<AdDetail>({
    queryKey: ['ad-detail', adId, range],
    queryFn: async () => (await api.ads.get(adId, dateParams)).data.data,
    enabled: Boolean(adId),
  });

  const { data: breakdownData, isLoading: breakdownLoading } = useQuery({
    queryKey: ['ad-breakdown', adId, breakdown, range],
    queryFn: async () =>
      (await api.ads.breakdown(adId, { breakdown, ...dateParams })).data.data,
    enabled: Boolean(adId) && breakdown !== 'none',
  });

  const { data: leadsResponse, isLoading: leadsLoading } = useQuery<{
    count: number;
    data: Lead[];
  }>({
    queryKey: ['ad-leads', adId],
    queryFn: async () => (await api.ads.leads(adId)).data,
    enabled: Boolean(adId),
  });

  const leads = leadsResponse?.data || [];

  const heroMetrics = adData
    ? [
        { label: 'Spend', value: formatCurrency(adData.metrics.spend), icon: DollarSign, color: 'text-brand-400' },
        { label: 'Impressions', value: adData.metrics.impressions.toLocaleString(), icon: BarChart2, color: 'text-cyan-400' },
        { label: 'Reach', value: adData.metrics.reach.toLocaleString(), icon: Users, color: 'text-sky-400' },
        { label: 'Clicks', value: adData.metrics.clicks.toLocaleString(), icon: MousePointerClick, color: 'text-amber-400' },
        { label: 'CTR', value: formatPercent(adData.metrics.ctr), icon: MousePointerClick, color: 'text-orange-400' },
        { label: 'CPC', value: formatCurrency(adData.metrics.cpc), icon: DollarSign, color: 'text-yellow-400' },
        { label: 'CPM', value: formatCurrency(adData.metrics.cpm), icon: BarChart2, color: 'text-purple-400' },
        { label: 'Conversions', value: adData.metrics.conversions.toFixed(0), icon: Users, color: 'text-green-400' },
      ]
    : [];

  return (
    <div className="p-6 max-w-[1400px] space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-surface-500 flex-wrap">
        <Link href="/" className="hover:text-white transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <Link href="/campaigns" className="hover:text-white transition-colors">Campaigns</Link>
        {adData?.campaign && (
          <>
            <ChevronRight size={12} />
            <Link
              href={`/campaigns/${adData.campaign.id}/adsets`}
              className="hover:text-white transition-colors"
            >
              {adData.campaign.name}
            </Link>
          </>
        )}
        {adData?.adSet && (
          <>
            <ChevronRight size={12} />
            <Link
              href={`/adsets/${adData.adSet.id}/ads`}
              className="hover:text-white transition-colors"
            >
              {adData.adSet.name}
            </Link>
          </>
        )}
        <ChevronRight size={12} />
        <span className="text-white font-medium">{adData?.name || 'Ad'}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Megaphone size={18} className="text-brand-400" />
            {adLoading ? (
              <div className="skeleton h-6 w-48 rounded" />
            ) : (
              <h1 className="text-xl font-bold text-white">{adData?.name}</h1>
            )}
            {adData?.status && (
              <span className={cn('badge text-[10px]', getStatusColor(adData.status))}>
                {adData.status}
              </span>
            )}
          </div>
          <p className="text-surface-400 text-sm font-mono">{adId}</p>
        </div>

        {adData?.adSet && (
          <Link
            href={`/adsets/${adData.adSet.id}/ads`}
            className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={12} />
            Back to {adData.adSet.name}
          </Link>
        )}
      </div>

      {adError && (
        <div className="card p-6 text-sm text-red-400">
          Failed to load ad details. Check your Meta connection.
        </div>
      )}

      {/* Hero Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {adLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card p-4">
                <div className="skeleton h-3 w-16 rounded mb-3" />
                <div className="skeleton h-6 w-20 rounded" />
              </div>
            ))
          : heroMetrics.map((m) => (
              <div key={m.label} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-surface-400 uppercase tracking-wider">{m.label}</p>
                  <m.icon size={12} className={m.color} />
                </div>
                <p className="text-lg font-bold text-white tabular-nums">{m.value}</p>
              </div>
            ))
        }
      </div>

      {/* Creative + Extra Metrics */}
      {!adLoading && adData && (
        <div className="grid md:grid-cols-2 gap-5">
          {/* Creative Preview */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Creative</h2>
            {adData.creative.imageUrl && (
              <div className="rounded-lg overflow-hidden border border-white/10 max-h-52">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={adData.creative.imageUrl}
                  alt={adData.creative.title || 'Ad creative'}
                  className="w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}
            {adData.creative.title && (
              <div>
                <p className="text-xs text-surface-500 mb-1">Headline</p>
                <p className="text-white font-medium text-sm">{adData.creative.title}</p>
              </div>
            )}
            {adData.creative.body && (
              <div>
                <p className="text-xs text-surface-500 mb-1">Body</p>
                <p className="text-white/70 text-sm leading-relaxed line-clamp-4">{adData.creative.body}</p>
              </div>
            )}
            <div className="flex items-center gap-4 pt-1">
              {adData.creative.callToAction && (
                <span className="px-3 py-1 rounded-md bg-brand-600/20 text-brand-300 text-xs font-medium">
                  {adData.creative.callToAction.replace(/_/g, ' ')}
                </span>
              )}
              {adData.creative.objectUrl && (
                <a
                  href={adData.creative.objectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-surface-400 hover:text-white transition-colors"
                >
                  <ExternalLink size={10} />
                  Destination URL
                </a>
              )}
            </div>
          </div>

          {/* Extended Metrics */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Additional Metrics</h2>
            <div className="space-y-3">
              {[
                { label: 'Cost per Conversion (CPA)', value: formatCurrency(adData.metrics.cpa) },
                { label: 'Return on Ad Spend (ROAS)', value: `${adData.metrics.roas.toFixed(2)}×` },
                { label: 'Frequency', value: adData.metrics.frequency.toFixed(2) },
                { label: 'ad set', value: adData.adSet?.name || '—' },
                { label: 'Campaign', value: adData.campaign?.name || '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                  <span className="text-sm text-surface-400">{label}</span>
                  <span className="text-sm text-white font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Breakdown Section */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-violet-400" />
            <h2 className="text-sm font-semibold text-white">Audience Breakdown</h2>
          </div>
          <BreakdownSelector value={breakdown} onChange={setBreakdown} />
        </div>
        {breakdown === 'none' ? (
          <p className="text-sm text-surface-500">
            Select a breakdown dimension to analyze performance by age, gender, country, platform, or placement.
          </p>
        ) : (
          <BreakdownTable data={breakdownData || []} isLoading={breakdownLoading} />
        )}
      </div>

      {/* Leads Table */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-green-400" />
            <h2 className="text-sm font-semibold text-white">Leads</h2>
            {!leadsLoading && (
              <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs">
                {leadsResponse?.count ?? 0}
              </span>
            )}
          </div>
        </div>

        {leadsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="py-8 text-center">
            <Users size={20} className="text-surface-600 mx-auto mb-2" />
            <p className="text-sm text-surface-400">
              No leads found. This ad may not be connected to a lead gen form, or no leads have been collected yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Name', 'Email', 'Phone', 'Source', 'Date', ''].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2.5 text-xs font-medium text-surface-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {leads.map((lead) => {
                  const extraFields = Object.entries(lead.rawFields).filter(
                    ([k]) => !['full_name', 'first_name', 'last_name', 'email', 'phone_number', 'phone', 'name'].includes(k)
                  );
                  const expanded = showAllLeadFields[lead.id];

                  return (
                    <React.Fragment key={lead.id}>
                      <tr className="hover:bg-surface-800/30 transition-colors">
                        <td className="px-3 py-3 text-white font-medium">
                          {lead.name || <span className="text-surface-500 italic">Unknown</span>}
                        </td>
                        <td className="px-3 py-3">
                          {lead.email ? (
                            <a
                              href={`mailto:${lead.email}`}
                              className="flex items-center gap-1.5 text-brand-400 hover:text-brand-300 transition-colors"
                            >
                              <Mail size={11} />
                              {lead.email}
                            </a>
                          ) : (
                            <span className="text-surface-500">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {lead.phone ? (
                            <div className="flex items-center gap-1.5 text-white/70">
                              <Phone size={11} className="text-surface-500" />
                              {lead.phone}
                            </div>
                          ) : (
                            <span className="text-surface-500">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 text-white/60">
                            <Globe size={11} className="text-surface-500" />
                            {lead.source}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 text-white/60 whitespace-nowrap">
                            <Calendar size={11} className="text-surface-500" />
                            {new Date(lead.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          {extraFields.length > 0 && (
                            <button
                              onClick={() =>
                                setShowAllLeadFields((prev) => ({ ...prev, [lead.id]: !prev[lead.id] }))
                              }
                              className="text-xs text-surface-400 hover:text-white transition-colors"
                            >
                              {expanded ? 'Less' : `+${extraFields.length} fields`}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded && extraFields.length > 0 && (
                        <tr className="bg-surface-900/40">
                          <td colSpan={6} className="px-6 py-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {extraFields.map(([k, v]) => (
                                <div key={k} className="space-y-0.5">
                                  <p className="text-[10px] text-surface-500 uppercase tracking-wide">{k.replace(/_/g, ' ')}</p>
                                  <p className="text-xs text-white/70">{v || '—'}</p>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
