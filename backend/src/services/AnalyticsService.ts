import { ICampaign, IMetrics } from '../models/Campaign';
import { Campaign } from '../models/Campaign';
import { logger } from '../config';
import mongoose from 'mongoose';

interface HealthScoreBreakdown {
  ctrScore: number;
  cpaScore: number;
  roasScore: number;
  budgetUtilizationScore: number;
  total: number;
}

interface Anomaly {
  metric: string;
  type: 'spike' | 'drop';
  percentage: number;
  message: string;
}

interface Suggestion {
  title: string;
  reason: string;
  impact: 'high' | 'medium' | 'low';
  priority: number;
  type: string;
}

export class AnalyticsService {
  // ── Health Score Calculation ───────────────────────────────────────────────
  calculateHealthScore(
    metrics: IMetrics,
    budget: { daily?: number; lifetime?: number },
    industryBenchmarks?: { ctr: number; cpa: number; roas: number }
  ): { score: number; breakdown: HealthScoreBreakdown } {
    const benchmarks = industryBenchmarks || { ctr: 1.5, cpa: 25, roas: 2.5 };

    // CTR Score (0-25 points)
    let ctrScore = 0;
    if (metrics.ctr >= benchmarks.ctr * 1.5) ctrScore = 25;
    else if (metrics.ctr >= benchmarks.ctr) ctrScore = 20;
    else if (metrics.ctr >= benchmarks.ctr * 0.7) ctrScore = 12;
    else if (metrics.ctr > 0) ctrScore = 5;

    // CPA Score (0-25 points) — lower is better
    let cpaScore = 0;
    if (metrics.cpa === 0 && metrics.spend > 0) {
      cpaScore = 5; // spending but no conversions
    } else if (metrics.cpa === 0) {
      cpaScore = 0;
    } else if (metrics.cpa <= benchmarks.cpa * 0.5) cpaScore = 25;
    else if (metrics.cpa <= benchmarks.cpa) cpaScore = 20;
    else if (metrics.cpa <= benchmarks.cpa * 1.5) cpaScore = 12;
    else cpaScore = 5;

    // ROAS Score (0-30 points)
    let roasScore = 0;
    if (metrics.roas >= benchmarks.roas * 2) roasScore = 30;
    else if (metrics.roas >= benchmarks.roas * 1.5) roasScore = 25;
    else if (metrics.roas >= benchmarks.roas) roasScore = 18;
    else if (metrics.roas >= 1) roasScore = 10;
    else if (metrics.spend > 0) roasScore = 3;

    // Budget Utilization Score (0-20 points)
    let budgetUtilizationScore = 0;
    const dailyBudget = budget.daily || 0;
    if (dailyBudget > 0 && metrics.spend > 0) {
      const utilization = metrics.spend / dailyBudget;
      if (utilization >= 0.8 && utilization <= 1.0) budgetUtilizationScore = 20;
      else if (utilization >= 0.6) budgetUtilizationScore = 15;
      else if (utilization >= 0.4) budgetUtilizationScore = 10;
      else budgetUtilizationScore = 5;
    } else {
      budgetUtilizationScore = 10; // neutral if no budget data
    }

    const total = Math.round(ctrScore + cpaScore + roasScore + budgetUtilizationScore);

    return {
      score: Math.min(100, Math.max(0, total)),
      breakdown: { ctrScore, cpaScore, roasScore, budgetUtilizationScore, total },
    };
  }

  // ── Anomaly Detection ─────────────────────────────────────────────────────
  detectAnomalies(
    current: IMetrics,
    previous: IMetrics,
    thresholdPercent = 20
  ): Anomaly[] {
    const anomalies: Anomaly[] = [];

    const metricsToCheck: Array<{
      key: keyof IMetrics;
      label: string;
      direction: 'higher_bad' | 'lower_bad' | 'both';
    }> = [
      { key: 'cpa', label: 'CPA', direction: 'higher_bad' },
      { key: 'ctr', label: 'CTR', direction: 'lower_bad' },
      { key: 'roas', label: 'ROAS', direction: 'lower_bad' },
      { key: 'cpc', label: 'CPC', direction: 'higher_bad' },
      { key: 'cpm', label: 'CPM', direction: 'both' },
      { key: 'spend', label: 'Spend', direction: 'both' },
    ];

    for (const { key, label, direction } of metricsToCheck) {
      const curr = current[key] as number;
      const prev = previous[key] as number;

      if (!prev || prev === 0) continue;

      const changePercent = ((curr - prev) / prev) * 100;
      const absChange = Math.abs(changePercent);

      if (absChange < thresholdPercent) continue;

      const isIncrease = changePercent > 0;

      let type: 'spike' | 'drop' = isIncrease ? 'spike' : 'drop';
      let shouldFlag = false;

      if (direction === 'higher_bad' && isIncrease) shouldFlag = true;
      if (direction === 'lower_bad' && !isIncrease) shouldFlag = true;
      if (direction === 'both') shouldFlag = true;

      if (shouldFlag) {
        anomalies.push({
          metric: key,
          type,
          percentage: Math.round(absChange),
          message: `${label} ${type === 'spike' ? 'increased' : 'decreased'} by ${Math.round(absChange)}% compared to previous period`,
        });
      }
    }

    return anomalies;
  }

  // ── Creative Fatigue Detection ─────────────────────────────────────────────
  detectCreativeFatigue(
    historicalMetrics: IMetrics[],
    consecutiveDays = 7,
    declineThreshold = 15
  ): { detected: boolean; ctrDeclinePercentage?: number; message?: string } {
    if (historicalMetrics.length < consecutiveDays) {
      return { detected: false };
    }

    const recent = historicalMetrics.slice(-consecutiveDays);
    const ctrs = recent.map((m) => m.ctr);

    // Calculate linear regression slope
    const n = ctrs.length;
    const sumX = ctrs.reduce((sum, _, i) => sum + i, 0);
    const sumY = ctrs.reduce((sum, v) => sum + v, 0);
    const sumXY = ctrs.reduce((sum, v, i) => sum + i * v, 0);
    const sumX2 = ctrs.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    const avgCtr = sumY / n;
    const projectedDecline = avgCtr > 0 ? (Math.abs(slope) * n / avgCtr) * 100 : 0;

    if (slope < 0 && projectedDecline >= declineThreshold) {
      return {
        detected: true,
        ctrDeclinePercentage: Math.round(projectedDecline),
        message: `CTR declining consistently. Estimated ${Math.round(projectedDecline)}% decline trend over last ${consecutiveDays} days.`,
      };
    }

    return { detected: false };
  }

  // ── Suggestion Generation ──────────────────────────────────────────────────
  generateSuggestions(campaign: ICampaign): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const { metrics, healthScore, budget } = campaign;

    // Low ROAS
    if (metrics.roas > 0 && metrics.roas < 1.5) {
      suggestions.push({
        title: 'Optimize for ROAS',
        reason: `ROAS is ${metrics.roas.toFixed(2)}x, below the 1.5x minimum viable threshold. Revenue generated is barely covering ad spend.`,
        impact: 'high',
        priority: 1,
        type: 'roas_optimization',
      });
    }

    // High CPA
    if (metrics.cpa > 0 && metrics.cpa > 50) {
      suggestions.push({
        title: 'Reduce Cost Per Acquisition',
        reason: `CPA of $${metrics.cpa.toFixed(2)} is high. Review targeting, bid strategy, and landing page conversion rate.`,
        impact: metrics.cpa > 100 ? 'high' : 'medium',
        priority: metrics.cpa > 100 ? 1 : 2,
        type: 'cpa_reduction',
      });
    }

    // Low CTR
    if (metrics.ctr > 0 && metrics.ctr < 0.8) {
      suggestions.push({
        title: 'Refresh Ad Creatives',
        reason: `CTR of ${metrics.ctr.toFixed(2)}% is below 0.8% benchmark. Consider A/B testing new headlines and visuals.`,
        impact: 'medium',
        priority: 2,
        type: 'creative_refresh',
      });
    }

    // Budget underutilization
    const dailyBudget = budget.daily || 0;
    if (dailyBudget > 0 && metrics.spend < dailyBudget * 0.5) {
      suggestions.push({
        title: 'Address Budget Underutilization',
        reason: `Campaign is only using ${Math.round((metrics.spend / dailyBudget) * 100)}% of its daily budget. Expand targeting or adjust bid strategy.`,
        impact: 'medium',
        priority: 3,
        type: 'budget_utilization',
      });
    }

    // High performing — suggest scaling
    if (metrics.roas >= 3 && metrics.ctr >= 2 && healthScore >= 75) {
      suggestions.push({
        title: 'Scale This Campaign',
        reason: `Strong performance: ROAS ${metrics.roas.toFixed(1)}x, CTR ${metrics.ctr.toFixed(2)}%. Increase daily budget by 20-30% to capture more revenue.`,
        impact: 'high',
        priority: 1,
        type: 'budget_increase',
      });
    }

    // Low frequency — ads not reaching enough
    if (metrics.frequency < 1.5 && metrics.impressions > 0) {
      suggestions.push({
        title: 'Increase Ad Frequency',
        reason: `Average frequency of ${metrics.frequency.toFixed(1)} is low. Broaden audience or increase budget to improve reach and frequency.`,
        impact: 'low',
        priority: 4,
        type: 'frequency_increase',
      });
    }

    // Pause if truly underperforming
    if (healthScore < 20 && metrics.spend > 100 && metrics.roas < 0.5) {
      suggestions.push({
        title: 'Consider Pausing This Campaign',
        reason: `Health score of ${healthScore}/100 with ROAS below 0.5x indicates significant budget waste. Pause to review strategy.`,
        impact: 'high',
        priority: 1,
        type: 'pause_campaign',
      });
    }

    return suggestions.sort((a, b) => a.priority - b.priority);
  }

  // ── Aggregate KPI Summary ─────────────────────────────────────────────────
  async getKPISummary(userId: mongoose.Types.ObjectId, adAccountId?: string) {
    const filter: Record<string, unknown> = { userId };
    if (adAccountId) filter.adAccountId = adAccountId;

    const campaigns = await Campaign.find(filter).lean();

    const totals = campaigns.reduce(
      (acc, c) => ({
        spend: acc.spend + (c.metrics?.spend || 0),
        impressions: acc.impressions + (c.metrics?.impressions || 0),
        clicks: acc.clicks + (c.metrics?.clicks || 0),
        conversions: acc.conversions + (c.metrics?.conversions || 0),
        revenue: acc.revenue + (c.metrics?.roas || 0) * (c.metrics?.spend || 0),
        activeCampaigns: acc.activeCampaigns + (c.status === 'ACTIVE' ? 1 : 0),
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, activeCampaigns: 0 }
    );

    const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const avgCpa = totals.conversions > 0 ? totals.spend / totals.conversions : 0;
    const avgRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
    const avgCpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;

    const avgHealthScore =
      campaigns.length > 0
        ? campaigns.reduce((sum, c) => sum + (c.healthScore || 0), 0) / campaigns.length
        : 0;

    const anomalyCount = campaigns.reduce((sum, c) => sum + (c.anomalies?.length || 0), 0);

    return {
      totalSpend: totals.spend,
      totalImpressions: totals.impressions,
      totalClicks: totals.clicks,
      totalConversions: totals.conversions,
      totalRevenue: totals.revenue,
      activeCampaigns: totals.activeCampaigns,
      totalCampaigns: campaigns.length,
      avgCtr,
      avgCpa,
      avgRoas,
      avgCpm,
      avgHealthScore: Math.round(avgHealthScore),
      anomalyCount,
    };
  }
}

export const analyticsService = new AnalyticsService();
