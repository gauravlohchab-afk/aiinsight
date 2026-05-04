import { Router, Response } from 'express';
import { query, param } from 'express-validator';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { validateRequest, asyncHandler, AppError } from '../middleware/errorHandler';
import { Campaign } from '../models/Campaign';
import { AdSet } from '../models/AdSet';
import { Ad } from '../models/Ad';
import { User } from '../models/User';
import { metaService } from '../services/MetaService';
import { analyticsService } from '../services/AnalyticsService';
import { enqueueSyncJob } from '../workers/syncWorker';
import { buildCacheKey, requestCache } from '../utils/requestCache';
import { logger } from '../config';
import mongoose from 'mongoose';

const router = Router();
router.use(authenticate);

const CAMPAIGNS_CACHE_TTL_MS = 45 * 1000;
const ADSETS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes to ease Meta rate limits
const SYNC_COOLDOWN_MS = 30 * 1000;
const syncCooldowns = new Map<string, number>();

// ── Fetch Live Meta Campaigns (Real-Time) ─────────────────────────────────────
/**
 * 🔄 REAL-TIME campaign fetching from Meta Graph API
 * Returns current list of campaigns WITHOUT waiting for background sync
 */
router.get(
  '/meta/list',
  [
    query('adAccountId').notEmpty().isString(),
    query('date_preset').optional().isString(),
    query('since').optional().isString(),
    query('until').optional().isString(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!._id;
    
    // ── Safely Extract & Validate adAccountId ───────────────────────────────
    const adAccountId = req.query.adAccountId?.toString()?.trim();
    const datePreset = req.query.date_preset?.toString()?.trim();
    const since = req.query.since?.toString()?.trim();
    const until = req.query.until?.toString()?.trim();
    
    if (!adAccountId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: adAccountId',
        details: 'Please provide adAccountId query parameter (e.g., act_123456)',
      });
    }

    const cacheKey = buildCacheKey([
      'campaigns',
      'meta-list',
      userId,
      adAccountId,
      datePreset || since || '',
      until || '',
    ]);
    const cachedResponse = requestCache.get<Record<string, unknown>>(cacheKey);
    if (cachedResponse) {
      return res.status(200).json(cachedResponse);
    }

    const dateParams = datePreset
      ? { preset: datePreset }
      : since && until
        ? { since, until }
        : undefined;

    console.log('📊 [Campaigns API] Fetching campaigns for:', {
      userId,
      adAccountId,
      selectedRange: { datePreset, since, until },
      metaParams: dateParams,
    });

    // ── Fetch User's Meta Token ────────────────────────────────────────────
    const user = await User.findById(userId).select('+metaAuth.accessToken');

    if (!user?.metaAuth?.accessToken) {
      console.warn('❌ [Campaigns API] User has no Meta access token', { userId });
      return res.status(401).json({
        success: false,
        message: 'Meta account not connected',
        details: 'Please connect your Meta Ads account to view campaigns.',
      });
    }

    const accessToken = user.metaAuth.accessToken;
    console.log('✅ [Campaigns API] Access token found, calling MetaService');

    try {
      // ── Call Meta Campaigns Service ────────────────────────────────────
      const campaigns = await metaService.getMetaCampaigns(
        accessToken,
        adAccountId,
        dateParams
      );

      console.log('✅ [Campaigns API] Successfully fetched campaigns:', {
        adAccountId,
        campaignCount: campaigns.length,
      });

      // ── Debug Insights Data ────────────────────────────────────────────
      campaigns.forEach((c: any, idx: number) => {
        const insightsCount = c.insights?.data?.length || 0;
        const spend = c.insights?.data?.[0]?.spend || 'N/A';
        console.log(`Campaign ${idx + 1}:`, {
          id: c.id,
          name: c.name,
          hasInsights: !!c.insights,
          insightsCount,
          firstInsightSpend: spend,
        });
      });

      // ── Return Structured Response ─────────────────────────────────────
      const responseBody = {
        success: true,
        message: `Found ${campaigns.length} campaigns`,
        data: {
          adAccountId,
          campaignCount: campaigns.length,
          campaigns,
          fetchedAt: new Date().toISOString(),
        },
      };

      requestCache.set(cacheKey, responseBody, CAMPAIGNS_CACHE_TTL_MS);

      return res.status(200).json(responseBody);
    } catch (error: any) {
      console.error('❌ [Campaigns API] Error fetching campaigns:', {
        adAccountId,
        errorMessage: error.message,
        errorCode: error.code,
      });

      // ── Structured Error Response ─────────────────────────────────────
      const statusCode = error.status || 400;
      const errorMessage =
        error.message || 'Failed to fetch campaigns from Meta';

      return res.status(statusCode).json({
        success: false,
        message: errorMessage,
        details:
          process.env.NODE_ENV === 'development'
            ? {
                error: error.message,
                code: error.code,
                statusCode: error.response?.status,
              }
            : 'Please try again or reconnect your Meta account.',
      });
    }
  })
);

// ── List Campaigns ────────────────────────────────────────────────────────────
router.get(
  '/',
  [
    query('adAccountId').optional().isString(),
    query('status').optional().isIn(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED']),
    query('sort').optional().isIn(['healthScore', 'spend', 'roas', 'ctr', 'name']),
    query('order').optional().isIn(['asc', 'desc']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = new mongoose.Types.ObjectId(req.user!._id);
    const cacheKey = buildCacheKey([
      'campaigns',
      'list',
      req.user!._id,
      req.query.adAccountId as string,
      req.query.status as string,
      req.query.sort as string,
      req.query.order as string,
      req.query.page as string,
      req.query.limit as string,
    ]);

    const cachedResponse = requestCache.get<Record<string, unknown>>(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const {
      adAccountId,
      status,
      sort = 'healthScore',
      order = 'desc',
      page = 1,
      limit = 20,
    } = req.query;

    const filter: Record<string, unknown> = { userId };
    if (adAccountId) filter.adAccountId = adAccountId;
    if (status) filter.status = status;

    const sortObj: Record<string, 1 | -1> = {
      [`metrics.${sort}`]: order === 'desc' ? -1 : 1,
    };
    if (sort === 'healthScore' || sort === 'name') {
      delete sortObj[`metrics.${sort}`];
      sortObj[sort as string] = order === 'desc' ? -1 : 1;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [campaigns, total] = await Promise.all([
      Campaign.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(Number(limit))
        .select('-historicalMetrics')
        .lean(),
      Campaign.countDocuments(filter),
    ]);

    const responseBody = {
      success: true,
      data: {
        campaigns,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
        },
      },
    };

    requestCache.set(cacheKey, responseBody, CAMPAIGNS_CACHE_TTL_MS);

    res.json(responseBody);
  })
);

// ── Get Campaign Ad Sets (Drill-down) ───────────────────────────────────────
router.get(
  '/:campaignId/adsets',
  [
    query('date_preset').optional().isString(),
    query('since').optional().isString(),
    query('until').optional().isString(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { campaignId } = req.params;
    const userId = req.user!._id;
    const datePreset = req.query.date_preset?.toString()?.trim();
    const since = req.query.since?.toString()?.trim();
    const until = req.query.until?.toString()?.trim();

    const cacheKey = buildCacheKey([
      'campaigns',
      'adsets',
      userId,
      campaignId,
      datePreset || since || '',
      until || '',
    ]);
    const cachedResponse = requestCache.get<Record<string, unknown>>(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const dateParams = datePreset
      ? { preset: datePreset }
      : since && until
        ? { since, until }
        : undefined;

    let dbCampaign: any = null;
    if (mongoose.Types.ObjectId.isValid(campaignId)) {
      dbCampaign = await Campaign.findOne({ _id: campaignId, userId }).lean();
    }

    if (!dbCampaign) {
      dbCampaign = await Campaign.findOne({ metaCampaignId: campaignId, userId }).lean();
    }

    const metaCampaignId = dbCampaign?.metaCampaignId || campaignId;
    const user = await User.findById(userId).select('+metaAuth.accessToken');

    if (!user?.metaAuth?.accessToken) {
      throw new AppError('Meta account not connected', 401);
    }

    let campaignResult: any = { campaign: null };
    try {
      campaignResult = await metaService.getSingleCampaignWithInsights(
        metaCampaignId,
        user.metaAuth.accessToken,
        dateParams
      );
    } catch (err: any) {
      logger.warn('⚠️ Could not fetch campaign details from Meta', { metaCampaignId, error: err?.message });
    }

    let adSets: any[] = [];
    let adSetsSource: 'live' | 'db' = 'live';

    try {
      const rawAdSets = await metaService.getCampaignAdSets(
        user.metaAuth.accessToken,
        metaCampaignId,
        dateParams
      );

      adSets = rawAdSets.map((adSet: any) => {
        const metrics = metaService.normalizeMetrics(adSet.insights?.data?.[0]);
        return {
          id: adSet.id,
          name: adSet.name,
          status: adSet.status,
          budget: {
            daily: adSet.daily_budget ? Number(adSet.daily_budget) / 100 : null,
            lifetime: adSet.lifetime_budget ? Number(adSet.lifetime_budget) / 100 : null,
          },
          metrics,
          _meta: { source: adSet.insights?.data?.length ? 'live' : 'partial' },
        };
      });
    } catch (metaErr: any) {
      const isRateLimit = metaErr?.response?.data?.error?.code === 17 ||
        metaErr?.response?.status === 400;
      logger.warn('⚠️ Meta API failed for campaign adsets, trying without date filter', {
        campaignId: metaCampaignId,
        error: metaErr?.message,
        isRateLimit,
      });
      adSetsSource = 'db';

      // If rate limited with a specific date filter, retry without date params
      // so we at least get the adsets list (with empty metrics)
      if (isRateLimit && dateParams) {
        try {
          const rawAdSets = await metaService.getCampaignAdSets(
            user.metaAuth.accessToken,
            metaCampaignId,
            undefined // no date filter
          );
          adSets = rawAdSets.map((adSet: any) => {
            const metrics = metaService.normalizeMetrics(adSet.insights?.data?.[0]);
            return {
              id: adSet.id,
              name: adSet.name,
              status: adSet.status,
              budget: {
                daily: adSet.daily_budget ? Number(adSet.daily_budget) / 100 : null,
                lifetime: adSet.lifetime_budget ? Number(adSet.lifetime_budget) / 100 : null,
              },
              metrics,
              _meta: { source: 'partial' },
            };
          });
          // Don't cache rate-limited fallback responses too long
          adSetsSource = 'live';
        } catch (_retryErr: any) {
          logger.warn('⚠️ Retry without date filter also failed, falling back to DB', { campaignId: metaCampaignId });
        }
      }

      // Fall back to locally synced ad sets if still empty
      if (adSets.length === 0) {
        const dbAdSets = await AdSet.find({ metaCampaignId, userId }).lean();
        adSets = dbAdSets.map((adSet: any) => ({
          id: adSet.metaAdSetId,
          name: adSet.name,
          status: adSet.status,
          budget: {
            daily: adSet.budget?.daily ?? null,
            lifetime: adSet.budget?.lifetime ?? null,
          },
          metrics: metaService.normalizeMetrics(adSet.metrics),
          _meta: { source: 'db' },
        }));
      }
    }

    const responseBody = {
      success: true,
      data: {
        campaign: {
          id: metaCampaignId,
          name: campaignResult.campaign?.name || dbCampaign?.name || 'Unknown Campaign',
          status: campaignResult.campaign?.status || dbCampaign?.status || 'UNKNOWN',
          objective: campaignResult.campaign?.objective || dbCampaign?.objective || '',
        },
        adsets: adSets,
      },
    };

    requestCache.set(cacheKey, responseBody, adSetsSource === 'db' ? 30 * 1000 : ADSETS_CACHE_TTL_MS);
    return res.json(responseBody);
  })
);

// ── Get Single Campaign (Real-Time from Meta + Local DB) ─────────────────────
router.get(
  '/:campaignId',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { campaignId } = req.params;
    const userId = req.user!._id;

    console.log('📊 [Campaign Detail] Fetching campaign:', { campaignId, userId });

    try {
      const user = await User.findById(userId).select('+metaAuth.accessToken');
      const accessToken = user?.metaAuth?.accessToken;

      // ── Step 1: Try DB lookup by MongoDB _id (only if it looks like an ObjectId) ─
      let dbCampaign: any = null;
      if (mongoose.Types.ObjectId.isValid(campaignId)) {
        dbCampaign = await Campaign.findOne({ _id: campaignId, userId }).lean();
      }

      // ── Step 2: If not found by _id, try by metaCampaignId ────────────────
      if (!dbCampaign) {
        dbCampaign = await Campaign.findOne({ metaCampaignId: campaignId, userId }).lean();
      }

      console.log('📊 [Campaign Detail] DB lookup result:', {
        found: !!dbCampaign,
        name: dbCampaign?.name,
        metaId: dbCampaign?.metaCampaignId,
      });

      // ── Step 3: Fetch real-time data from Meta API ────────────────────────
      let metaCampaignData: any = null;
      let insightData: any = null;

      // Determine the Meta campaign ID to use for API call
      const metaCampaignId = dbCampaign?.metaCampaignId || campaignId;

      if (accessToken) {
        try {
          console.log('📡 [Campaign Detail] Fetching from Meta API, metaCampaignId:', metaCampaignId);
          const result = await metaService.getSingleCampaignWithInsights(metaCampaignId, accessToken);
          metaCampaignData = result.campaign;
          insightData = result.insights;
          console.log('✅ [Campaign Detail] Meta live data fetched:', {
            name: metaCampaignData?.name,
            hasInsights: !!insightData,
            spend: insightData?.spend,
            ctr: insightData?.ctr,
            purchase_roas: insightData?.purchase_roas,
            actions: insightData?.actions,
          });
        } catch (err: any) {
          console.warn('⚠️ [Campaign Detail] Meta API fetch failed:', err.message);
          // If no DB record found AND Meta API fails, return 404
          if (!dbCampaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
          }
        }
      }

      // If no DB record and no Meta data, 404
      if (!dbCampaign && !metaCampaignData) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }

      // ── Step 4: Extract metrics with proper Meta field handling ──────────
      const metricsSource = insightData || dbCampaign?.metrics || {};

      const spend = Number(metricsSource.spend || 0);
      const ctr = Number(metricsSource.ctr || 0);
      const cpc = Number(metricsSource.cpc || 0);
      const impressions = Number(metricsSource.impressions || 0);
      const clicks = Number(metricsSource.clicks || 0);
      const reach = Number(metricsSource.reach || 0);
      const frequency = Number(metricsSource.frequency || 0);

      // Extract conversions from actions array (Meta standard)
      const conversions = Number(
        metricsSource.actions?.find((a: any) => a.action_type === 'lead')?.value ||
        metricsSource.actions?.find((a: any) => a.action_type === 'purchase')?.value ||
        metricsSource.conversions || 0
      );

      // Extract ROAS from purchase_roas array (Meta standard)
      const roas = Number(metricsSource.purchase_roas?.[0]?.value || 0) ||
        (spend > 0
          ? (metricsSource.action_values?.reduce((s: number, a: any) =>
              a.action_type === 'purchase' ? s + Number(a.value || 0) : s, 0) || 0) / spend
          : Number(metricsSource.roas || 0));

      console.log('✅ [Campaign Detail] Metrics extracted:', { spend, ctr, conversions, roas });

      // ── Step 5: Build response (Meta live data takes priority over DB) ────
      const name = metaCampaignData?.name || dbCampaign?.name || 'Unknown Campaign';
      const status = metaCampaignData?.status || dbCampaign?.status || 'UNKNOWN';
      const objective = metaCampaignData?.objective || dbCampaign?.objective || '';
      const healthScore = Number(dbCampaign?.healthScore || 0);

      return res.json({
        success: true,
        data: {
          _id: dbCampaign?._id || metaCampaignId,
          id: metaCampaignId,
          name,
          status,
          objective,
          healthScore,
          metrics: {
            spend,
            ctr,
            cpc,
            impressions,
            clicks,
            reach,
            frequency,
            conversions,
            cpm: Number(metricsSource.cpm || 0),
            cpa: conversions > 0 ? spend / conversions : 0,
            roas,
          },
          anomalies: dbCampaign?.anomalies || [],
          suggestions: dbCampaign?.suggestions || [],
          createdAt: dbCampaign?.createdAt,
          updatedAt: dbCampaign?.updatedAt,
          _meta: {
            source: insightData ? 'live' : 'cached',
            fetchedAt: new Date().toISOString(),
            metaCampaignId,
          },
        },
      });
    } catch (error: any) {
      console.error('❌ [Campaign Detail] Unexpected error:', {
        error: error.message,
        campaignId,
        userId,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch campaign',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      });
    }
  })
);

// ── Get Campaign Time Series ───────────────────────────────────────────────────
router.get(
  '/:campaignId/timeseries',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { campaignId } = req.params;
    const userId = req.user!._id;
    const { days = '30' } = req.query;
    const daysNum = Math.min(90, Math.max(7, parseInt(days as string)));

    console.log('📊 [Timeseries] Fetching daily insights for campaign:', { campaignId, daysNum });

    // ── Resolve the Meta campaign ID ────────────────────────────────────────
    let metaCampaignId = campaignId;

    if (mongoose.Types.ObjectId.isValid(campaignId)) {
      const dbCampaign = await Campaign.findOne({ _id: campaignId, userId })
        .select('metaCampaignId')
        .lean();
      if (dbCampaign?.metaCampaignId) {
        metaCampaignId = dbCampaign.metaCampaignId;
      }
    } else {
      // campaignId may be a metaCampaignId itself — also try DB lookup by it
      const dbCampaign = await Campaign.findOne({ metaCampaignId: campaignId, userId })
        .select('metaCampaignId')
        .lean();
      if (dbCampaign?.metaCampaignId) {
        metaCampaignId = dbCampaign.metaCampaignId;
      }
    }

    console.log('📡 [Timeseries] Resolved metaCampaignId:', metaCampaignId);

    // ── Fetch user token ─────────────────────────────────────────────────────
    const user = await User.findById(userId).select('+metaAuth.accessToken');

    if (!user?.metaAuth?.accessToken) {
      return res.json({ success: true, data: [] });
    }

    // ── Build date range ─────────────────────────────────────────────────────
    const until = new Date();
    const since = new Date();
    since.setDate(since.getDate() - daysNum);
    const dateRange = {
      since: since.toISOString().slice(0, 10),
      until: until.toISOString().slice(0, 10),
    };

    try {
      const rawInsights = await metaService.getCampaignInsights(
        user.metaAuth.accessToken,
        metaCampaignId,
        dateRange
      );

      console.log('✅ [Timeseries] Insights fetched:', rawInsights.length, 'days');

      const data = rawInsights.map((item: any) => {
        const spend = Number(item.spend || 0);

        // Extract conversions from actions array (Meta standard)
        const conversions = Number(
          item.actions?.find((a: any) => a.action_type === 'lead')?.value ||
          item.actions?.find((a: any) => a.action_type === 'purchase')?.value ||
          0
        );

        // Extract ROAS from purchase_roas array (Meta standard)
        const roas = Number(item.purchase_roas?.[0]?.value || 0) ||
          (spend > 0
            ? (item.action_values?.reduce((s: number, a: any) =>
                a.action_type === 'purchase' ? s + Number(a.value || 0) : s, 0) || 0) / spend
            : 0);

        return {
          date: item.date_start,
          spend,
          ctr: Number(item.ctr || 0),
          clicks: Number(item.clicks || 0),
          impressions: Number(item.impressions || 0),
          conversions,
          roas,
        };
      });

      console.log('📊 [Timeseries] Sample data:', data.slice(0, 2));

      return res.json({ success: true, data });
    } catch (err: any) {
      console.warn('⚠️ [Timeseries] Meta API failed, returning empty:', err.message);
      return res.json({ success: true, data: [] });
    }
  })
);

// ── Get Campaign Ads ───────────────────────────────────────────────────────────
router.get(
  '/:campaignId/ads',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const ads = await Ad.find({
      campaignId: req.params.campaignId,
      userId: req.user!._id,
    })
      .select('-historicalMetrics')
      .lean();

    res.json({ success: true, data: ads });
  })
);

// ── Trigger Manual Sync ────────────────────────────────────────────────────────
router.post(
  '/sync',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { adAccountId } = req.body;
    if (!adAccountId) throw new AppError('adAccountId is required', 400);

    const cooldownKey = buildCacheKey(['campaigns', 'sync', req.user!._id, adAccountId]);
    const lastRequestedAt = syncCooldowns.get(cooldownKey) || 0;

    if (Date.now() - lastRequestedAt < SYNC_COOLDOWN_MS) {
      return res.status(202).json({
        success: true,
        message: 'A sync was already requested recently. Please wait a few seconds.',
      });
    }

    syncCooldowns.set(cooldownKey, Date.now());

    try {
      await enqueueSyncJob(req.user!._id, adAccountId, 'full_sync');
    } catch (error) {
      syncCooldowns.delete(cooldownKey);
      throw error;
    }

    res.json({
      success: true,
      message: 'Sync job enqueued. Data will be updated shortly.',
    });
  })
);

// ── Mark Suggestion Applied ────────────────────────────────────────────────────
router.patch(
  '/:campaignId/suggestions/:suggestionId/apply',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const campaign = await Campaign.findOneAndUpdate(
      {
        _id: req.params.campaignId,
        userId: req.user!._id,
        'suggestions._id': req.params.suggestionId,
      },
      { $set: { 'suggestions.$.applied': true } },
      { new: true }
    );

    if (!campaign) throw new AppError('Campaign or suggestion not found', 404);
    res.json({ success: true, message: 'Suggestion marked as applied' });
  })
);

// ── KPI Summary ───────────────────────────────────────────────────────────────
router.get(
  '/summary/kpi',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = new mongoose.Types.ObjectId(req.user!._id);
    const { adAccountId } = req.query;
    const summary = await analyticsService.getKPISummary(userId, adAccountId as string);
    res.json({ success: true, data: summary });
  })
);

// ── GET /api/campaigns/:campaignId/breakdown ──────────────────────────────────
router.get(
  '/:campaignId/breakdown',
  [
    param('campaignId').notEmpty().isString(),
    query('breakdown').notEmpty().isString(),
    query('date_preset').optional().isString(),
    query('since').optional().isString(),
    query('until').optional().isString(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { campaignId } = req.params;
    const userId = req.user!._id;
    const breakdown = req.query.breakdown!.toString().trim();
    const datePreset = req.query.date_preset?.toString().trim();
    const since = req.query.since?.toString().trim();
    const until = req.query.until?.toString().trim();

    const cacheKey = buildCacheKey([
      'campaigns', 'breakdown', userId, campaignId, breakdown, datePreset || since || '', until || '',
    ]);
    const cached = requestCache.get<Record<string, unknown>>(cacheKey);
    if (cached) return res.json(cached);

    const user = await User.findById(userId).select('+metaAuth.accessToken');
    if (!user?.metaAuth?.accessToken) throw new AppError('Meta account not connected', 401);

    const dateParams = datePreset
      ? { preset: datePreset }
      : since && until
        ? { since, until }
        : undefined;

    // Resolve meta campaign id
    let metaCampaignId = campaignId;
    if (mongoose.Types.ObjectId.isValid(campaignId)) {
      const dbCampaign = await Campaign.findOne({ _id: campaignId, userId }).lean();
      if (dbCampaign) metaCampaignId = (dbCampaign as any).metaCampaignId || campaignId;
    }

    const rows = await metaService.getEntityBreakdown(
      metaCampaignId,
      user.metaAuth.accessToken,
      breakdown,
      dateParams
    );

    const responseBody = { success: true, breakdown, data: rows };
    requestCache.set(cacheKey, responseBody, CAMPAIGNS_CACHE_TTL_MS);
    return res.json(responseBody);
  })
);

export default router;
