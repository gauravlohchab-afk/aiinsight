'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Sparkles, Target, Users, DollarSign,
  BarChart2, RefreshCw, ChevronRight, CheckCircle2,
  AlertCircle, TrendingUp, Zap, Clock, ArrowRight, MousePointerClick, Megaphone
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useCurrencyStore } from '@/lib/currencyStore';
import { cn, formatRelative, formatCurrency, formatPercent } from '@/lib/utils';
import toast from 'react-hot-toast';

const audienceSchema = z.object({
  ageMin: z.number().min(18).max(65),
  ageMax: z.number().min(18).max(65),
  locations: z.string(),
  interests: z.string(),
  painPoints: z.string(),
  description: z.string().min(20, 'Please describe your audience in at least 20 characters'),
});

type AudienceForm = z.infer<typeof audienceSchema>;

interface AlignmentResult {
  alignment_score: number;
  gaps: string[];
  recommendations: string[];
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 8 ? '#4ade80' : score >= 6 ? '#22d3ee' : score >= 4 ? '#fbbf24' : '#f87171';
  const pct = (score / 10) * 100;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
          <circle
            cx="60" cy="60" r="50" fill="none"
            stroke={color} strokeWidth="10"
            strokeDasharray={`${2 * Math.PI * 50}`}
            strokeDashoffset={`${2 * Math.PI * 50 * (1 - pct / 100)}`}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${color}80)`, transition: 'stroke-dashoffset 1.2s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-white">{score}</span>
          <span className="text-xs text-surface-500">/ 10</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-center" style={{ color }}>
          {score >= 8 ? 'Excellent Alignment' : score >= 6 ? 'Good Alignment' : score >= 4 ? 'Moderate Gaps' : 'Poor Alignment'}
        </p>
        <p className="text-xs text-surface-500 text-center mt-0.5">Audience ↔ Campaign match</p>
      </div>
    </div>
  );
}

function InsightCard({ type, items, icon: Icon, title, color }: {
  type: 'gap' | 'rec';
  items: string[];
  icon: any;
  title: string;
  color: string;
}) {
  return (
    <div className="card p-5">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-white mb-4">
        <div className={cn('w-6 h-6 rounded-md flex items-center justify-center', `bg-${color}-500/10`)}>
          <Icon size={13} className={`text-${color}-400`} />
        </div>
        {title}
        <span className={cn('ml-auto badge text-[10px]', `text-${color}-400 bg-${color}-500/10`)}>
          {items.length}
        </span>
      </h4>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex items-start gap-2.5"
          >
            <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', `bg-${color}-400`)} />
            <p className="text-sm text-surface-300 leading-relaxed">{item}</p>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtext,
  icon: Icon,
}: {
  label: string;
  value: string;
  subtext: string;
  icon: any;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">{label}</p>
        <Icon size={14} className="text-brand-400" />
      </div>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <p className="text-xs text-surface-500">{subtext}</p>
    </div>
  );
}

export default function AIInsightsPage() {
  const { selectedAdAccount } = useAuthStore();
  // Subscribe to currency store so values re-render when currency changes
  useCurrencyStore();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<AlignmentResult | null>(null);
  const [activeTab, setActiveTab] = useState<'audience' | 'performance' | 'history'>('audience');

  const { register, handleSubmit, formState: { errors } } = useForm<AudienceForm>({
    resolver: zodResolver(audienceSchema),
    defaultValues: { ageMin: 25, ageMax: 45 },
  });

  // Fetch real campaign data for performance review
  const { data: campaignMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['campaign-metrics', selectedAdAccount],
    queryFn: async () => {
      if (!selectedAdAccount) return null;
      try {
        const response = await api.campaigns.metaList({
          adAccountId: selectedAdAccount,
        });
        const campaigns = response?.data?.data?.campaigns || [];
        
        console.log('📊 [AI] Raw campaigns received:', campaigns.length);

        // Extract spend from insights (structure: insights.data[0].spend)
        const campaignsWithMetrics = campaigns.map((c: any) => {
          const insights = c.insights?.data?.[0];
          const spend = insights?.spend ? Number(insights.spend) : 0;
          const ctr = insights?.ctr ? Number(insights.ctr) : 0;
          const cpa = insights?.cpa ? Number(insights.cpa) : 0;
          const conversions = insights?.conversions ? Number(insights.conversions) : 0;
          
          return {
            ...c,
            spend,
            ctr,
            cpa,
            conversions,
          };
        });

        // Debug log
        console.log('💰 [AI] Campaign spend breakdown:', campaignsWithMetrics.map((c: any) => ({
          name: c.name,
          spend: c.spend,
          spendNumeric: Number(c.spend),
          spendGtZero: Number(c.spend) > 0,
        })));
        
        // Filter campaigns with any signal (spend OR impressions OR clicks > 0)
        const withData = campaignsWithMetrics.filter((c: any) => {
          return (
            Number(c.spend) > 0 ||
            Number(c.impressions) > 0 ||
            Number(c.clicks) > 0
          );
        });

        // If nothing has data yet, use all campaigns (we still want to show them)
        const validCampaigns = withData.length > 0 ? withData : campaignsWithMetrics;

        console.log(`✅ [AI] Filtered to ${validCampaigns.length} campaigns with data from ${campaigns.length} total`);
        
        if (!validCampaigns.length) return null;
        
        // Calculate metrics
        const totalSpend = validCampaigns.reduce((sum: number, c: any) => sum + (Number(c.spend) || 0), 0);
        const avgCTR = validCampaigns.reduce((sum: number, c: any) => sum + (Number(c.ctr) || 0), 0) / validCampaigns.length;
        const avgCPA = validCampaigns.reduce((sum: number, c: any) => sum + (Number(c.cpa) || 0), 0) / validCampaigns.length;
        const totalConversions = validCampaigns.reduce((sum: number, c: any) => sum + (Number(c.conversions) || 0), 0);
        
        return {
          count: validCampaigns.length,
          totalSpend,
          avgCTR,
          avgCPA,
          totalConversions,
          campaigns: validCampaigns,
        };
      } catch (err) {
        console.warn('Failed to fetch campaign metrics:', err);
        return null;
      }
    },
    enabled: Boolean(selectedAdAccount) && activeTab === 'performance',
  });

  const { data: history } = useQuery({
    queryKey: ['ai-history', selectedAdAccount],
    queryFn: () => api.ai.history({ limit: 10 }),
    enabled: Boolean(selectedAdAccount),
    select: (r) => r.data.data.insights,
  });

  const analysisMutation = useMutation({
    mutationFn: (data: AudienceForm) =>
      api.ai.analyzeAudience({
        adAccountId: selectedAdAccount,
        audienceDefinition: {
          ageRange: { min: data.ageMin, max: data.ageMax },
          locations: data.locations.split(',').map((s) => s.trim()).filter(Boolean),
          interests: data.interests.split(',').map((s) => s.trim()).filter(Boolean),
          painPoints: data.painPoints.split(',').map((s) => s.trim()).filter(Boolean),
          description: data.description,
        },
      }),
    onSuccess: (res) => {
      setResult(res.data.data);
      toast.success('AI analysis complete!');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Analysis failed');
    },
  });

  const performanceReviewMutation = useMutation({
    mutationFn: () => api.ai.performanceReview(selectedAdAccount!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-history'] });
      toast.success('Performance review ready!');
    },
    onError: () => toast.error('Review failed'),
  });

  const tabs = [
    { id: 'audience', label: 'Audience Analysis', icon: Users },
    { id: 'performance', label: 'Performance Review', icon: BarChart2 },
    { id: 'history', label: 'History', icon: Clock },
  ];

  return (
    <div className="max-w-[1400px] p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center">
            <Brain size={16} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">AI Insights</h1>
          <span className="badge bg-brand-500/15 text-brand-300 border border-brand-500/20 text-[10px]">
            GPT-4 Powered
          </span>
        </div>
        <p className="text-surface-400 text-sm">
          Get elite marketing intelligence — audience gap analysis, budget optimization & creative insights.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-white/5 bg-surface-950 p-1 sm:w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:px-4',
              activeTab === tab.id
                ? 'bg-surface-800 text-white shadow-sm'
                : 'text-surface-400 hover:text-white'
            )}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Audience Analysis ── */}
      {activeTab === 'audience' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          {/* Form */}
          <div className="xl:col-span-2">
            <div className="card p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                <Target size={14} className="text-brand-400" />
                Define Your Target Audience
              </h3>
              <p className="text-xs text-surface-500 mb-5">
                The more detail you provide, the more accurate the analysis.
              </p>

              <form onSubmit={handleSubmit((d) => analysisMutation.mutate(d))} className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label text-xs">Min Age</label>
                    <input
                      {...register('ageMin', { valueAsNumber: true })}
                      type="number"
                      className="input text-sm"
                      placeholder="25"
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Max Age</label>
                    <input
                      {...register('ageMax', { valueAsNumber: true })}
                      type="number"
                      className="input text-sm"
                      placeholder="45"
                    />
                  </div>
                </div>

                <div>
                  <label className="label text-xs">Locations (comma-separated)</label>
                  <input
                    {...register('locations')}
                    className="input text-sm"
                    placeholder="US, UK, Canada"
                  />
                </div>

                <div>
                  <label className="label text-xs">Interests (comma-separated)</label>
                  <input
                    {...register('interests')}
                    className="input text-sm"
                    placeholder="fitness, nutrition, wellness"
                  />
                </div>

                <div>
                  <label className="label text-xs">Pain Points (comma-separated)</label>
                  <input
                    {...register('painPoints')}
                    className="input text-sm"
                    placeholder="lack of energy, weight management"
                  />
                </div>

                <div>
                  <label className="label text-xs">Audience Description *</label>
                  <textarea
                    {...register('description')}
                    rows={4}
                    className="input text-sm resize-none"
                    placeholder="Describe your ideal customer in detail — their lifestyle, goals, buying behavior, and what makes them choose your product..."
                  />
                  {errors.description && (
                    <p className="mt-1 text-xs text-red-400">{errors.description.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={analysisMutation.isPending || !selectedAdAccount}
                  className="btn-primary w-full py-3"
                >
                  {analysisMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 60" />
                      </svg>
                      Analyzing with AI…
                    </span>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      Run AI Analysis
                    </>
                  )}
                </button>

                {!selectedAdAccount && (
                  <p className="text-xs text-amber-400 text-center">
                    Select an ad account first
                  </p>
                )}
              </form>
            </div>
          </div>

          {/* Results */}
          <div className="xl:col-span-3 space-y-4">
            {analysisMutation.isPending && (
              <div className="card flex flex-col items-center gap-4 p-8 sm:p-12">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />
                  <div className="relative w-16 h-16 rounded-full bg-brand-500/10 border border-brand-500/30 flex items-center justify-center">
                    <Brain size={24} className="text-brand-400" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-white font-medium">Analyzing your audience…</p>
                  <p className="text-surface-500 text-sm mt-1">
                    GPT-4 is reviewing your campaigns and targeting data
                  </p>
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-brand-500"
                      style={{ animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }}
                    />
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence>
              {result && !analysisMutation.isPending && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {/* Show message if placeholder */}
                  {(result as any)?.isPlaceholder && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="card p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5 shrink-0">
                          <div className="w-2 h-2 rounded-full bg-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-blue-300">
                            {(result as any)?.message || 'Awaiting campaign data...'}
                          </p>
                          <p className="text-xs text-blue-300/70 mt-1">
                            Once you launch campaigns and collect data, you'll get detailed AI insights.
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Score */}
                  <div className="card flex flex-col gap-6 p-4 sm:flex-row sm:items-center sm:p-6">
                    <ScoreGauge score={result.alignment_score} />
                    <div className="flex-1">
                      <h3 className="text-base font-bold text-white mb-2">
                        {(result as any)?.isPlaceholder ? 'Get Started' : 'Analysis Complete'}
                      </h3>
                      {!(result as any)?.isPlaceholder && (result as any)?.campaignCount > 0 && (
                        <p className="text-xs text-brand-400 font-medium mb-2">
                          Analyzing {(result as any).campaignCount} campaign{(result as any).campaignCount !== 1 ? 's' : ''}
                        </p>
                      )}
                      <p className="text-sm text-surface-300 leading-relaxed">
                        {(result as any)?.isPlaceholder
                          ? 'Follow the steps below to enable detailed AI audience analysis for your campaigns.'
                          : 'Your audience definition was compared against your active campaign targeting and performance data. The score reflects how well your current campaigns are reaching your intended audience.'}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          <span className="text-surface-400">{result.gaps.length} gaps</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          <span className="text-surface-400">{result.recommendations.length} recommendations</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InsightCard
                      type="gap"
                      items={result.gaps}
                      icon={AlertCircle}
                      title={`${(result as any)?.isPlaceholder ? 'Next Steps' : 'Audience Gaps'}`}
                      color="red"
                    />
                    <InsightCard
                      type="rec"
                      items={result.recommendations}
                      icon={TrendingUp}
                      title={`${(result as any)?.isPlaceholder ? 'Getting Started' : 'Recommendations'}`}
                      color="green"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!result && !analysisMutation.isPending && (
              <div className="card flex flex-col items-center p-8 text-center sm:p-12">
                <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-4">
                  <Brain size={28} className="text-brand-400" />
                </div>
                <h3 className="text-white font-semibold mb-2">AI Analysis Ready</h3>
                <p className="text-surface-400 text-sm max-w-sm">
                  Fill in your target audience details on the left to get AI-powered gap analysis
                  and campaign recommendations.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Performance Review ── */}
      {activeTab === 'performance' && (
        <div className="max-w-5xl space-y-6">
          {/* Campaign Metrics Overview */}
          {metricsLoading && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="card p-4">
                  <div className="skeleton h-4 w-32 rounded mb-3" />
                  <div className="skeleton h-8 w-16 rounded mb-1" />
                  <div className="skeleton h-3 w-24 rounded" />
                </div>
              ))}
            </div>
          )}
          
          {!metricsLoading && campaignMetrics && (
            <motion.div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <MetricCard
                label="Campaigns"
                value={campaignMetrics.count.toString()}
                subtext="with signal"
                icon={Target}
              />
              <MetricCard
                label="Total Spend"
                value={formatCurrency(campaignMetrics.totalSpend)}
                subtext="last 30 days"
                icon={DollarSign}
              />
              <MetricCard
                label="Avg CTR"
                value={formatPercent(campaignMetrics.avgCTR)}
                subtext="click-through rate"
                icon={MousePointerClick}
              />
              <MetricCard
                label="Conversions"
                value={Math.round(campaignMetrics.totalConversions).toString()}
                subtext="all campaigns"
                icon={Users}
              />
            </motion.div>
          )}

          <div className="card p-4 sm:p-6">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <BarChart2 size={16} className="text-brand-400" />
              AI Performance Review
            </h3>
            <p className="text-sm text-surface-400 mb-5">
              Get a comprehensive AI review of your entire account — what's working, what's not,
              and exactly what to do next. Analysis is based on real campaign data from the last 30 days.
            </p>
            <button
              onClick={() => performanceReviewMutation.mutate()}
              disabled={performanceReviewMutation.isPending || !selectedAdAccount || !campaignMetrics?.count}
              className="btn-primary gap-2"
            >
              {performanceReviewMutation.isPending ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 60" />
                  </svg>
                  Generating AI Review…
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  Generate Performance Review
                </>
              )}
            </button>
            {!campaignMetrics?.count && !metricsLoading && (
              <p className="text-xs text-amber-400 mt-3">
                💡 No campaigns with spend detected. Launch a campaign with budget to enable AI analysis.
              </p>
            )}
          </div>

          {performanceReviewMutation.data && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {(() => {
                const result = performanceReviewMutation.data.data?.data || performanceReviewMutation.data.data || {};
                const campaigns: any[] = result.campaigns || [];
                const summary: string = result.overallSummary || result.overall_assessment || '';

                const statusConfig = {
                  good: { color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20', dot: 'bg-green-400', label: 'Good' },
                  average: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-400', label: 'Average' },
                  poor: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', dot: 'bg-red-400', label: 'Poor' },
                };

                return (
                  <>
                    {/* Overall Summary */}
                    {summary && (
                      <div className="card p-5 bg-brand-500/5 border-brand-500/20">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-white mb-2">
                          <Target size={14} className="text-brand-400" />
                          Account Summary
                        </h4>
                        <p className="text-sm text-surface-300 leading-relaxed">{summary}</p>
                      </div>
                    )}

                    {/* Per-Campaign Cards */}
                    {campaigns.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-medium text-surface-400 uppercase tracking-wider">
                          Campaign Breakdown — {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
                        </h4>
                        {campaigns.map((c: any, idx: number) => {
                          const cfg = statusConfig[c.status as 'good' | 'average' | 'poor'] || statusConfig.average;
                          const ads: any[] = c.ads || [];
                          return (
                            <motion.div
                              key={c.campaignId || idx}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="card p-5 space-y-4"
                            >
                              {/* Campaign Header */}
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-white truncate">{c.campaignName}</p>
                                  <p className="text-[11px] font-mono text-surface-600 mt-0.5">{c.campaignId}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  {typeof c.performanceScore === 'number' && (
                                    <span className="badge shrink-0 border border-brand-500/20 bg-brand-500/10 text-[10px] text-brand-300">
                                      Score {c.performanceScore}/100
                                    </span>
                                  )}
                                  {c.confidence && (
                                    <span className="badge shrink-0 border border-white/10 bg-surface-800 text-[10px] text-surface-300">
                                      {String(c.confidence).toUpperCase()} confidence
                                    </span>
                                  )}
                                  <span className={cn('badge border text-[10px] shrink-0', cfg.bg, cfg.color)}>
                                    <span className={cn('w-1.5 h-1.5 rounded-full inline-block mr-1', cfg.dot)} />
                                    {cfg.label}
                                  </span>
                                </div>
                              </div>

                              {/* Campaign Metrics */}
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                                {[
                                  { label: 'Spend', value: formatCurrency(c.spend || 0) },
                                  { label: 'CTR', value: formatPercent(c.ctr || 0) },
                                  { label: 'ROAS', value: `${(c.roas || 0).toFixed(2)}x` },
                                  { label: 'Conv.', value: Math.round(c.conversions || 0).toString() },
                                  { label: 'CPC', value: formatCurrency(c.cpc || 0) },
                                  { label: 'Clicks', value: Math.round(c.clicks || 0).toString() },
                                ].map((m) => (
                                  <div key={m.label} className="bg-surface-800/50 rounded-lg p-2.5 text-center">
                                    <p className="text-[10px] text-surface-500 mb-1">{m.label}</p>
                                    <p className="text-sm font-semibold text-white tabular-nums">{m.value}</p>
                                  </div>
                                ))}
                              </div>

                              {/* Campaign Insights & Recommendations */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {Array.isArray(c.insights) && c.insights.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-medium text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                      <AlertCircle size={10} /> Insights
                                    </p>
                                    <ul className="space-y-1.5">
                                      {c.insights.map((insight: string, i: number) => (
                                        <li key={i} className="flex items-start gap-2 text-xs text-surface-300">
                                          <div className="w-1 h-1 rounded-full bg-red-400 mt-1.5 shrink-0" />
                                          {insight}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {Array.isArray(c.recommendations) && c.recommendations.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-medium text-green-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                      <TrendingUp size={10} /> Recommendations
                                    </p>
                                    <ul className="space-y-1.5">
                                      {c.recommendations.map((rec: string, i: number) => (
                                        <li key={i} className="flex items-start gap-2 text-xs text-surface-300">
                                          <div className="w-1 h-1 rounded-full bg-green-400 mt-1.5 shrink-0" />
                                          {rec}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>

                              {/* Per-Ad Breakdown */}
                              {ads.length > 0 && (
                                <div className="border-t border-white/5 pt-4 space-y-3">
                                  <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Megaphone size={10} />
                                    Ad Breakdown — {ads.length} ad{ads.length !== 1 ? 's' : ''}
                                  </p>
                                  {ads.map((ad: any, adIdx: number) => {
                                    const adCfg = statusConfig[ad.status as 'good' | 'average' | 'poor'] || statusConfig.average;
                                    return (
                                      <div
                                        key={ad.adId || adIdx}
                                        className="bg-surface-800/40 border border-white/5 rounded-xl p-3 space-y-3 sm:p-4"
                                      >
                                        {/* Ad Header */}
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-white truncate">{ad.adName}</p>
                                            <p className="text-[10px] font-mono text-surface-600 mt-0.5">{ad.adId}</p>
                                          </div>
                                          <span className={cn('badge border text-[10px] shrink-0', adCfg.bg, adCfg.color)}>
                                            <span className={cn('w-1 h-1 rounded-full inline-block mr-1', adCfg.dot)} />
                                            {adCfg.label}
                                          </span>
                                        </div>

                                        {/* Ad Metrics */}
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                          {[
                                            { label: 'Spend', value: formatCurrency(ad.spend || 0) },
                                            { label: 'CTR', value: formatPercent(ad.ctr || 0) },
                                            { label: 'Conv.', value: Math.round(ad.conversions || 0).toString() },
                                          ].map((m) => (
                                            <div key={m.label} className="bg-surface-900/60 rounded-lg px-2.5 py-2 text-center">
                                              <p className="text-[9px] text-surface-500 mb-0.5">{m.label}</p>
                                              <p className="text-xs font-semibold text-white tabular-nums">{m.value}</p>
                                            </div>
                                          ))}
                                        </div>

                                        {/* Ad Insights & Recommendations */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                          {Array.isArray(ad.insights) && ad.insights.length > 0 && (
                                            <ul className="space-y-1">
                                              {ad.insights.map((insight: string, i: number) => (
                                                <li key={i} className="flex items-start gap-1.5 text-[11px] text-surface-400">
                                                  <div className="w-1 h-1 rounded-full bg-red-400 mt-1.5 shrink-0" />
                                                  {insight}
                                                </li>
                                              ))}
                                            </ul>
                                          )}
                                          {Array.isArray(ad.recommendations) && ad.recommendations.length > 0 && (
                                            <ul className="space-y-1">
                                              {ad.recommendations.map((rec: string, i: number) => (
                                                <li key={i} className="flex items-start gap-1.5 text-[11px] text-surface-400">
                                                  <div className="w-1 h-1 rounded-full bg-green-400 mt-1.5 shrink-0" />
                                                  {rec}
                                                </li>
                                              ))}
                                            </ul>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    )}

                    {/* Fallback: old flat format */}
                    {campaigns.length === 0 && Object.keys(result).length > 0 && (
                      Object.entries(result).map(([key, value]) => {
                        const labels: Record<string, { label: string; icon: any; color: string }> = {
                          overall_assessment: { label: 'Overall Assessment', icon: Target, color: 'brand' },
                          top_performing_campaigns: { label: 'Top Performers', icon: TrendingUp, color: 'green' },
                          underperforming_campaigns: { label: 'Underperformers', icon: AlertCircle, color: 'red' },
                          budget_reallocation: { label: 'Budget Reallocation', icon: DollarSign, color: 'amber' },
                          quick_wins: { label: 'Quick Wins', icon: Zap, color: 'cyan' },
                          strategic_changes: { label: 'Strategic Changes', icon: Brain, color: 'purple' },
                        };
                        const meta = labels[key];
                        if (!meta) return null;
                        return (
                          <div key={key} className="card p-5">
                            <h4 className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
                              <meta.icon size={14} className={`text-${meta.color}-400`} />
                              {meta.label}
                            </h4>
                            {typeof value === 'string' ? (
                              <p className="text-sm text-surface-300 leading-relaxed">{value}</p>
                            ) : Array.isArray(value) ? (
                              <ul className="space-y-2">
                                {(value as string[]).map((item, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm text-surface-300">
                                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-${meta.color}-400`} />
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </>
                );
              })()}
            </motion.div>
          )}
        </div>
      )}

      {/* ── Tab: History ── */}
      {activeTab === 'history' && (
        <div className="max-w-3xl space-y-3">
          {(history || []).length === 0 ? (
            <div className="card p-12 text-center">
              <Clock size={32} className="mx-auto text-surface-700 mb-3" />
              <p className="text-surface-400 text-sm">No AI analyses yet</p>
              <p className="text-surface-600 text-xs mt-1">Run an analysis to see history here</p>
            </div>
          ) : (
            (history || []).map((insight: any) => (
              <div key={insight._id} className="card p-5 hover:border-white/10 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                    <Brain size={16} className="text-brand-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-white capitalize">
                        {insight.type.replaceAll('_', ' ')}
                      </p>
                      {typeof insight.score === 'number' && (
                        <span className="badge bg-green-500/10 text-green-400 text-[10px]">
                          Score: {insight.score}/10
                        </span>
                      )}
                      <span className="text-[11px] text-surface-500">{formatRelative(insight.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-surface-300">{insight.summary}</p>
                    {Array.isArray(insight.insights) && insight.insights.length > 0 && (
                      <div className="mt-4">
                        <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-surface-500">Insights</p>
                        <div className="space-y-2">
                          {insight.insights.slice(0, 3).map((item: string, index: number) => (
                            <div key={index} className="flex items-start gap-2 text-xs text-surface-300">
                              <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {Array.isArray(insight.recommendations) && insight.recommendations.length > 0 && (
                      <div className="mt-4">
                        <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-surface-500">Recommendations</p>
                        <div className="space-y-2">
                          {insight.recommendations.slice(0, 3).map((item: string, index: number) => (
                            <div key={index} className="flex items-start gap-2 text-xs text-surface-300">
                              <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <ChevronRight size={14} className="mt-1 text-surface-600" />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
