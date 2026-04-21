import { Router, Response } from 'express';
import { query } from 'express-validator';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { validateRequest, asyncHandler, AppError } from '../middleware/errorHandler';
import { Campaign } from '../models/Campaign';
import { Ad } from '../models/Ad';
import { User } from '../models/User';
import { analyticsService } from '../services/AnalyticsService';
import { metaService } from '../services/MetaService';
import { buildCacheKey, requestCache } from '../utils/requestCache';
import mongoose from 'mongoose';

const router = Router();
router.use(authenticate);

const ANALYTICS_CACHE_TTL_MS = 30 * 1000;
const DEFAULT_BREAKDOWNS = ['gender', 'age', 'platform', 'placement'] as const;

// ── Overview Dashboard ────────────────────────────────────────────────────────
router.get(
  '/overview',
  [
    query('adAccountId').optional().isString(),
    query('date_preset').optional().isString(),
    query('since').optional().isString(),
    query('until').optional().isString(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = new mongoose.Types.ObjectId(req.user!._id);
    const { adAccountId, date_preset, since, until } = req.query;

    const dateParams = date_preset
      ? { preset: date_preset as string }
      : since && until
        ? { since: since as string, until: until as string }
        : undefined;

    console.log('📊 [Analytics] Overview selected range:', {
      adAccountId,
      date_preset,
      since,
      until,
    });

    const cacheKey = buildCacheKey([
      'analytics',
      'overview',
      req.user!._id,
      adAccountId as string,
      (date_preset || since || '') as string,
      (until || '') as string,
    ]);
    const cachedResponse = requestCache.get<Record<string, unknown>>(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const user = await User.findById(userId).select('+metaAuth.accessToken');

    const campaigns = await Campaign.find({
      userId,
      ...(adAccountId ? { adAccountId } : {}),
    })
      .sort({ healthScore: -1 })
      .limit(5)
      .select('name status healthScore metrics.spend metrics.roas metrics.ctr anomalies suggestions')
      .lean();

    let kpi = await analyticsService.getKPISummary(userId, adAccountId as string);

    if (user?.metaAuth?.accessToken && adAccountId) {
      const liveCampaigns = await metaService.getMetaCampaigns(
        user.metaAuth.accessToken,
        adAccountId as string,
        dateParams
      );

      if (liveCampaigns.length > 0) {
        const liveTotals = liveCampaigns.reduce(
          (acc, campaign) => {
            const metrics = metaService.normalizeMetrics(campaign.insights?.data?.[0]);

            return {
              spend: acc.spend + (metrics.spend || 0),
              impressions: acc.impressions + (metrics.impressions || 0),
              clicks: acc.clicks + (metrics.clicks || 0),
              conversions: acc.conversions + (metrics.conversions || 0),
              revenue: acc.revenue + ((metrics.roas || 0) * (metrics.spend || 0)),
              activeCampaigns: acc.activeCampaigns + (campaign.status === 'ACTIVE' ? 1 : 0),
            };
          },
          { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, activeCampaigns: 0 }
        );

        kpi = {
          ...kpi,
          totalSpend: liveTotals.spend,
          totalImpressions: liveTotals.impressions,
          totalClicks: liveTotals.clicks,
          totalConversions: liveTotals.conversions,
          totalRevenue: liveTotals.revenue,
          activeCampaigns: liveTotals.activeCampaigns,
          avgCtr: liveTotals.impressions > 0 ? (liveTotals.clicks / liveTotals.impressions) * 100 : 0,
          avgCpa: liveTotals.conversions > 0 ? liveTotals.spend / liveTotals.conversions : 0,
          avgRoas: liveTotals.spend > 0 ? liveTotals.revenue / liveTotals.spend : 0,
          avgCpm: liveTotals.impressions > 0 ? (liveTotals.spend / liveTotals.impressions) * 1000 : 0,
        };

        console.log('📊 [Analytics] Overview live KPI params:', dateParams);
        console.log('📊 [Analytics] Overview live KPI:', kpi);
      }
    }

    const topAnomalies = campaigns
      .flatMap((c) =>
        (c.anomalies || []).map((a: any) => ({
          campaignName: c.name,
          campaignId: c._id,
          ...a,
        }))
      )
      .sort((a: any, b: any) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
      .slice(0, 10);

    const pendingSuggestions = campaigns
      .flatMap((c) =>
        (c.suggestions || [])
          .filter((s: any) => !s.applied)
          .map((s: any) => ({
            campaignName: c.name,
            campaignId: c._id,
            ...s,
          }))
      )
      .sort((a: any, b: any) => a.priority - b.priority)
      .slice(0, 10);

    const responseBody = {
      success: true,
      data: {
        kpi,
        topCampaigns: campaigns,
        topAnomalies,
        pendingSuggestions,
      },
    };

    requestCache.set(cacheKey, responseBody, ANALYTICS_CACHE_TTL_MS);

    res.json(responseBody);
  })
);

// ── Fetch Live Meta Insights ──────────────────────────────────────────────────
/**
 * 🔄 REAL-TIME insights fetching from Meta Graph API
 * Fetches campaign-level insights with full error handling & detailed logging
 */
router.get(
  '/meta-insights',
  [query('adAccountId').notEmpty().isString(), validateRequest],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!._id;
    const { adAccountId } = req.query;

    // ── Fetch User's Meta Token ────────────────────────────────────────────
    const user = await User.findById(userId).select('+metaAuth.accessToken');

    if (!user?.metaAuth?.accessToken) {
      throw new AppError(
        'Meta account not connected. Please connect your Meta Ads account.',
        401
      );
    }

    const accessToken = user.metaAuth.accessToken;

    try {
      // ── Call Meta Insights Service ─────────────────────────────────────
      const insightsData = await metaService.getAdInsights(
        adAccountId as string,
        accessToken,
        2 // max 2 retries
      );

      // ── Return Structured Response ─────────────────────────────────────
      return res.json({
        success: true,
        message: 'Insights fetched successfully',
        data: {
          adAccountId,
          recordCount: insightsData.length,
          insights: insightsData,
          fetchedAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      // ── Structured Error Response ─────────────────────────────────────
      const errorCode = error.code || 'META_INSIGHTS_ERROR';
      const errorMessage =
        error.message ||
        'Failed to fetch Meta insights. Please check your connection.';

      return res.status(error.status || 400).json({
        success: false,
        error: {
          code: errorCode,
          message: errorMessage,
          details:
            process.env.NODE_ENV === 'development'
              ? error.message
              : 'Please try again or reconnect your Meta account.',
        },
      });
    }
  })
);

// ── Spend Over Time (Chart Data) ──────────────────────────────────────────────
router.get(
  '/spend-over-time',
  [
    query('adAccountId').optional().isString(),
    query('days').optional().isInt({ min: 1, max: 365 }),
    query('date_preset').optional().isString(),
    query('since').optional().isString(),
    query('until').optional().isString(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = new mongoose.Types.ObjectId(req.user!._id);
    const { adAccountId, days = 30, date_preset, since, until } = req.query;

    const cacheKey = buildCacheKey([
      'analytics',
      'spend-over-time',
      req.user!._id,
      adAccountId as string,
      (date_preset || since || days) as string,
      (until || '') as string,
    ]);
    const cachedResponse = requestCache.get<Record<string, unknown>>(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const user = await User.findById(userId).select('+metaAuth.accessToken');

    if (!user?.metaAuth?.accessToken || !adAccountId) {
      const responseBody = { success: true, data: [] };
      requestCache.set(cacheKey, responseBody, ANALYTICS_CACHE_TTL_MS);
      return res.json(responseBody);
    }

    const dateParams = (date_preset || since) ? {
      preset: date_preset as string | undefined,
      since: since as string | undefined,
      until: until as string | undefined,
    } : undefined;

    const chartData = await metaService.getDailyAdAccountInsights(
      user.metaAuth.accessToken,
      adAccountId as string,
      Number(days),
      dateParams
    );

    console.log('📊 [Analytics] Daily spend insights:', chartData);

    const responseBody = { success: true, data: chartData };
    requestCache.set(cacheKey, responseBody, ANALYTICS_CACHE_TTL_MS);

    res.json(responseBody);
  })
);

// ── Performance Breakdown by Campaign ──────────────────────────────────────────
router.get(
  '/performance-breakdown',
  [
    query('adAccountId').optional().isString(),
    query('date_preset').optional().isString(),
    query('since').optional().isString(),
    query('until').optional().isString(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = new mongoose.Types.ObjectId(req.user!._id);
    const { adAccountId, date_preset, since, until } = req.query;

    const cacheKey = buildCacheKey([
      'analytics',
      'performance-breakdown',
      req.user!._id,
      adAccountId as string,
      (date_preset || since || '') as string,
      (until || '') as string,
    ]);
    const cachedResponse = requestCache.get<Record<string, unknown>>(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const user = await User.findById(userId).select('+metaAuth.accessToken');

    if (!user?.metaAuth?.accessToken || !adAccountId) {
      const responseBody = { success: true, data: [] };
      requestCache.set(cacheKey, responseBody, ANALYTICS_CACHE_TTL_MS);
      return res.json(responseBody);
    }

    const dateParams = (date_preset || since) ? {
      preset: date_preset as string | undefined,
      since: since as string | undefined,
      until: until as string | undefined,
    } : undefined;

    const campaigns = await metaService.getMetaCampaigns(
      user.metaAuth.accessToken,
      adAccountId as string,
      dateParams
    );

    const breakdown = campaigns.map((campaign) => {
      const insight = campaign.insights?.data?.[0];
      console.log('PERFORMANCE:', { campaignName: campaign.name, insight });

      const spend = Number(insight?.spend || 0);
      const clicks = Number(insight?.clicks || 0);
      const impressions = Number(insight?.impressions || 0);
      const cpc = Number(insight?.cpc || 0);
      const ctr = Number(insight?.ctr || 0);

      // ── Extract Conversions from actions array (Meta standard) ────────────────────────────
      const conversions =
        Number(insight?.actions?.find((a: any) => a.action_type === 'lead')?.value) ||
        Number(insight?.actions?.find((a: any) => a.action_type === 'purchase')?.value) ||
        (Array.isArray(insight?.conversions)
          ? insight.conversions.reduce((sum: number, c: any) => {
              return ['purchase', 'lead', 'complete_registration'].includes(c.action_type)
                ? sum + Number(c.value || 0)
                : sum;
            }, 0)
          : 0) ||
        0;

      // ── Extract ROAS from purchase_roas array (Meta standard) ──────────────────────────────
      const roas = Number(insight?.purchase_roas?.[0]?.value || 0);

      // ── Extract revenue from action_values as fallback for ROAS calculation ────────────────
      const revenue = Array.isArray(insight?.action_values)
        ? insight.action_values.reduce((sum: number, action: any) => {
            return action.action_type === 'purchase' ? sum + Number(action.value || 0) : sum;
          }, 0)
        : 0;

      console.log('ACTIONS:', { campaign: campaign.name, actions: insight?.actions, roas: insight?.purchase_roas, conversions });

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        healthScore: 0,
        spend,
        roas: roas || (spend > 0 ? revenue / spend : 0),
        ctr,
        cpa: conversions > 0 ? spend / conversions : cpc,
        conversions,
        impressions,
        clicks,
        budgetUtilization: null,
      };
    });

    const responseBody = { success: true, data: breakdown };
    requestCache.set(cacheKey, responseBody, ANALYTICS_CACHE_TTL_MS);

    res.json(responseBody);
  })
);

// ── Multi-Breakdowns for Analytics UI ───────────────────────────────────────
router.get(
  '/breakdowns',
  [
    query('adAccountId').optional().isString(),
    query('date_preset').optional().isString(),
    query('since').optional().isString(),
    query('until').optional().isString(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = new mongoose.Types.ObjectId(req.user!._id);
    const { adAccountId, date_preset, since, until } = req.query;

    const cacheKey = buildCacheKey([
      'analytics',
      'breakdowns',
      req.user!._id,
      adAccountId as string,
      (date_preset || since || '') as string,
      (until || '') as string,
    ]);
    const cachedResponse = requestCache.get<Record<string, unknown>>(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const user = await User.findById(userId).select('+metaAuth.accessToken');

    if (!user?.metaAuth?.accessToken || !adAccountId) {
      const responseBody = {
        success: true,
        data: { gender: [], age: [], platform: [], placement: [] },
      };
      requestCache.set(cacheKey, responseBody, ANALYTICS_CACHE_TTL_MS);
      return res.json(responseBody);
    }

    const dateParams = (date_preset || since)
      ? {
          preset: date_preset as string | undefined,
          since: since as string | undefined,
          until: until as string | undefined,
        }
      : undefined;

    const breakdowns = await metaService.getEntityBreakdowns(
      adAccountId as string,
      user.metaAuth.accessToken,
      [...DEFAULT_BREAKDOWNS],
      dateParams
    );

    const responseBody = {
      success: true,
      data: {
        gender: breakdowns.gender || [],
        age: breakdowns.age || [],
        platform: breakdowns.platform || [],
        placement: breakdowns.placement || [],
      },
    };

    requestCache.set(cacheKey, responseBody, ANALYTICS_CACHE_TTL_MS);
    return res.json(responseBody);
  })
);

// ── Anomaly Feed ──────────────────────────────────────────────────────────────
router.get(
  '/anomalies',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = new mongoose.Types.ObjectId(req.user!._id);
    const cacheKey = buildCacheKey(['analytics', 'anomalies', req.user!._id]);
    const cachedResponse = requestCache.get<Record<string, unknown>>(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const campaigns = await Campaign.find({
      userId,
      'anomalies.0': { $exists: true },
    })
      .select('name anomalies')
      .lean();

    const anomalies = campaigns
      .flatMap((c) =>
        (c.anomalies || []).map((a: any) => ({
          campaignId: c._id,
          campaignName: c.name,
          metric: a.metric,
          type: a.type,
          percentage: a.percentage,
          message: a.message,
          detectedAt: a.detectedAt,
        }))
      )
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());

    const responseBody = { success: true, data: anomalies };
    requestCache.set(cacheKey, responseBody, ANALYTICS_CACHE_TTL_MS);

    res.json(responseBody);
  })
);

// ── Creative Fatigue Report ────────────────────────────────────────────────────
router.get(
  '/creative-fatigue',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = new mongoose.Types.ObjectId(req.user!._id);
    const cacheKey = buildCacheKey(['analytics', 'creative-fatigue', req.user!._id]);
    const cachedResponse = requestCache.get<Record<string, unknown>>(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const fadingAds = await Ad.find({
      userId,
      'creativeFatigue.detected': true,
    })
      .select('name creative metrics creativeFatigue campaignId')
      .populate('campaignId', 'name')
      .lean();

    const responseBody = { success: true, data: fadingAds };
    requestCache.set(cacheKey, responseBody, ANALYTICS_CACHE_TTL_MS);

    res.json(responseBody);
  })
);

// ── Health Score Distribution ─────────────────────────────────────────────────
router.get(
  '/health-distribution',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = new mongoose.Types.ObjectId(req.user!._id);
    const cacheKey = buildCacheKey(['analytics', 'health-distribution', req.user!._id]);
    const cachedResponse = requestCache.get<Record<string, unknown>>(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const result = await Campaign.aggregate([
      { $match: { userId } },
      {
        $bucket: {
          groupBy: '$healthScore',
          boundaries: [0, 20, 40, 60, 80, 101],
          default: 'other',
          output: {
            count: { $sum: 1 },
            campaigns: { $push: '$name' },
          },
        },
      },
    ]);

    const distribution = [
      { label: 'Critical (0–19)', min: 0, max: 19, count: 0, color: '#ef4444' },
      { label: 'Poor (20–39)', min: 20, max: 39, count: 0, color: '#f97316' },
      { label: 'Fair (40–59)', min: 40, max: 59, count: 0, color: '#eab308' },
      { label: 'Good (60–79)', min: 60, max: 79, count: 0, color: '#22c55e' },
      { label: 'Excellent (80–100)', min: 80, max: 100, count: 0, color: '#06b6d4' },
    ];

    result.forEach((bucket: any) => {
      const match = distribution.find((d) => d.min === bucket._id);
      if (match) match.count = bucket.count;
    });

    const responseBody = { success: true, data: distribution };
    requestCache.set(cacheKey, responseBody, ANALYTICS_CACHE_TTL_MS);

    res.json(responseBody);
  })
);

// ── Unified Analytics Endpoint (Date Range) ───────────────────────────────────
router.get(
  '/',
  [
    query('since').optional().isString(),
    query('until').optional().isString(),
    query('adAccountId').optional().isString(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = new mongoose.Types.ObjectId(req.user!._id);
    const { adAccountId, since, until } = req.query;

    const cacheKey = buildCacheKey(['analytics', 'unified', req.user!._id, adAccountId as string, since as string, until as string]);
    const cached = requestCache.get<Record<string, unknown>>(cacheKey);
    if (cached) return res.json(cached);

    const user = await User.findById(userId).select('+metaAuth.accessToken');

    if (!user?.metaAuth?.accessToken || !adAccountId) {
      const responseBody = { success: true, data: [] };
      requestCache.set(cacheKey, responseBody, ANALYTICS_CACHE_TTL_MS);
      return res.json(responseBody);
    }

    const days = since && until
      ? Math.max(1, Math.ceil((new Date(until as string).getTime() - new Date(since as string).getTime()) / (1000 * 60 * 60 * 24)) + 1)
      : 30;

    const data = await metaService.getDailyAdAccountInsights(
      user.metaAuth.accessToken,
      adAccountId as string,
      days
    );

    const responseBody = { success: true, data };
    requestCache.set(cacheKey, responseBody, ANALYTICS_CACHE_TTL_MS);
    res.json(responseBody);
  })
);

export default router;
