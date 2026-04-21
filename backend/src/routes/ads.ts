import { Router, Response } from 'express';
import { query, param } from 'express-validator';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, AppError, validateRequest } from '../middleware/errorHandler';
import { User } from '../models/User';
import { metaService } from '../services/MetaService';
import { buildCacheKey, requestCache } from '../utils/requestCache';

const router = Router();
router.use(authenticate);

const ADS_CACHE_TTL_MS = 45 * 1000;

// ── GET /api/ads/:adId ─────────────────────────────────────────────────────
router.get(
  '/:adId',
  [
    param('adId').notEmpty().isString(),
    query('date_preset').optional().isString(),
    query('since').optional().isString(),
    query('until').optional().isString(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { adId } = req.params;
    const userId = req.user!._id;
    const datePreset = req.query.date_preset?.toString()?.trim();
    const since = req.query.since?.toString()?.trim();
    const until = req.query.until?.toString()?.trim();

    const cacheKey = buildCacheKey([
      'ads', 'detail', userId, adId, datePreset || since || '', until || '',
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

    const ad = await metaService.getSingleAdWithInsights(
      user.metaAuth.accessToken,
      adId,
      dateParams
    );

    const responseBody = {
      success: true,
      data: {
        id: ad.id,
        name: ad.name,
        status: ad.status,
        adSetId: ad.adset_id,
        campaignId: ad.campaign_id,
        adSet: ad.adset
          ? { id: ad.adset.id, name: ad.adset.name }
          : null,
        campaign: ad.campaign
          ? { id: ad.campaign.id, name: ad.campaign.name }
          : null,
        creative: {
          title: ad.creative?.title || '',
          body: ad.creative?.body || '',
          imageUrl: ad.creative?.image_url || '',
          videoId: ad.creative?.video_id || '',
          callToAction: ad.creative?.call_to_action_type || '',
          objectUrl: ad.creative?.object_url || '',
        },
        metrics: metaService.normalizeMetrics(ad.insights?.data?.[0]),
      },
    };

    requestCache.set(cacheKey, responseBody, ADS_CACHE_TTL_MS);
    return res.json(responseBody);
  })
);

// ── GET /api/ads/:adId/breakdown ────────────────────────────────────────────
router.get(
  '/:adId/breakdown',
  [
    param('adId').notEmpty().isString(),
    query('breakdown').notEmpty().isString(),
    query('date_preset').optional().isString(),
    query('since').optional().isString(),
    query('until').optional().isString(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { adId } = req.params;
    const userId = req.user!._id;
    const breakdown = req.query.breakdown!.toString().trim();
    const datePreset = req.query.date_preset?.toString().trim();
    const since = req.query.since?.toString().trim();
    const until = req.query.until?.toString().trim();

    const cacheKey = buildCacheKey([
      'ads', 'breakdown', userId, adId, breakdown, datePreset || since || '', until || '',
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

    const rows = await metaService.getEntityBreakdown(
      adId,
      user.metaAuth.accessToken,
      breakdown,
      dateParams
    );

    const responseBody = { success: true, breakdown, data: rows };
    requestCache.set(cacheKey, responseBody, ADS_CACHE_TTL_MS);
    return res.json(responseBody);
  })
);

// ── GET /api/ads/:adId/leads ────────────────────────────────────────────────
router.get(
  '/:adId/leads',
  [
    param('adId').notEmpty().isString(),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { adId } = req.params;
    const userId = req.user!._id;
    const limit = parseInt(req.query.limit?.toString() || '50', 10);

    const cacheKey = buildCacheKey(['ads', 'leads', userId, adId, String(limit)]);
    const cached = requestCache.get<Record<string, unknown>>(cacheKey);
    if (cached) return res.json(cached);

    const user = await User.findById(userId).select('+metaAuth.accessToken');
    if (!user?.metaAuth?.accessToken) throw new AppError('Meta account not connected', 401);

    const leads = await metaService.getAdLeads(
      user.metaAuth.accessToken,
      adId,
      limit
    );

    const responseBody = { success: true, count: leads.length, data: leads };
    // Leads are less volatile — cache 2 minutes
    requestCache.set(cacheKey, responseBody, 120 * 1000);
    return res.json(responseBody);
  })
);

export default router;
