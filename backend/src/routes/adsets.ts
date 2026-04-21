import { Router, Response } from 'express';
import { query } from 'express-validator';
import mongoose from 'mongoose';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, AppError, validateRequest } from '../middleware/errorHandler';
import { AdSet } from '../models/AdSet';
import { User } from '../models/User';
import { metaService } from '../services/MetaService';
import { buildCacheKey, requestCache } from '../utils/requestCache';

const router = Router();
router.use(authenticate);

const ADSETS_CACHE_TTL_MS = 45 * 1000;
const DEFAULT_BREAKDOWNS = ['gender', 'age', 'platform', 'placement'] as const;

async function resolveMetaAdSetId(userId: string, adSetId: string) {
  let dbAdSet: any = null;

  if (mongoose.Types.ObjectId.isValid(adSetId)) {
    dbAdSet = await AdSet.findOne({ _id: adSetId, userId }).lean();
  }

  if (!dbAdSet) {
    dbAdSet = await AdSet.findOne({ metaAdSetId: adSetId, userId }).lean();
  }

  return {
    dbAdSet,
    metaAdSetId: dbAdSet?.metaAdSetId || adSetId,
  };
}

router.get(
  '/:adSetId/ads',
  [
    query('date_preset').optional().isString(),
    query('since').optional().isString(),
    query('until').optional().isString(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { adSetId } = req.params;
    const userId = req.user!._id;
    const datePreset = req.query.date_preset?.toString()?.trim();
    const since = req.query.since?.toString()?.trim();
    const until = req.query.until?.toString()?.trim();

    const cacheKey = buildCacheKey([
      'adsets',
      'ads',
      userId,
      adSetId,
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

    const { dbAdSet, metaAdSetId } = await resolveMetaAdSetId(userId, adSetId);
    const user = await User.findById(userId).select('+metaAuth.accessToken');

    if (!user?.metaAuth?.accessToken) {
      throw new AppError('Meta account not connected', 401);
    }

    const adSet = await metaService.getSingleAdSetWithInsights(
      user.metaAuth.accessToken,
      metaAdSetId,
      dateParams
    );
    const rawAds = await metaService.getAdSetAds(
      user.metaAuth.accessToken,
      metaAdSetId,
      dateParams
    );

    const responseBody = {
      success: true,
      data: {
        adSet: {
          id: adSet.id,
          name: adSet.name,
          status: adSet.status,
          campaign: {
            id: adSet.campaign?.id || dbAdSet?.metaCampaignId || '',
            name: adSet.campaign?.name || 'Campaign',
          },
          budget: {
            daily: adSet.daily_budget ? Number(adSet.daily_budget) / 100 : null,
            lifetime: adSet.lifetime_budget ? Number(adSet.lifetime_budget) / 100 : null,
          },
          metrics: metaService.normalizeMetrics(adSet.insights?.data?.[0]),
        },
        ads: rawAds.map((ad: any) => ({
          id: ad.id,
          name: ad.name,
          status: ad.status,
          creative: {
            title: ad.creative?.title || '',
            body: ad.creative?.body || '',
            imageUrl: ad.creative?.image_url || '',
            callToAction: ad.creative?.call_to_action_type || '',
          },
          metrics: metaService.normalizeMetrics(ad.insights?.data?.[0]),
        })),
      },
    };

    requestCache.set(cacheKey, responseBody, ADSETS_CACHE_TTL_MS);
    return res.json(responseBody);
  })
);

// ── GET /api/adsets/:adSetId/breakdowns ────────────────────────────────────
router.get(
  '/:adSetId/breakdowns',
  [
    query('date_preset').optional().isString(),
    query('since').optional().isString(),
    query('until').optional().isString(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { adSetId } = req.params;
    const userId = req.user!._id;
    const datePreset = req.query.date_preset?.toString().trim();
    const since = req.query.since?.toString().trim();
    const until = req.query.until?.toString().trim();

    const cacheKey = buildCacheKey([
      'adsets',
      'breakdowns',
      userId,
      adSetId,
      datePreset || since || '',
      until || '',
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

    const { metaAdSetId } = await resolveMetaAdSetId(userId, adSetId);
    const breakdowns = await metaService.getEntityBreakdowns(
      metaAdSetId,
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

    requestCache.set(cacheKey, responseBody, ADSETS_CACHE_TTL_MS);
    return res.json(responseBody);
  })
);

// ── GET /api/adsets/:adSetId/breakdown ─────────────────────────────────────
router.get(
  '/:adSetId/breakdown',
  [
    query('breakdown').notEmpty().isString(),
    query('date_preset').optional().isString(),
    query('since').optional().isString(),
    query('until').optional().isString(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { adSetId } = req.params;
    const userId = req.user!._id;
    const breakdown = req.query.breakdown!.toString().trim();
    const datePreset = req.query.date_preset?.toString().trim();
    const since = req.query.since?.toString().trim();
    const until = req.query.until?.toString().trim();

    const cacheKey = buildCacheKey([
      'adsets', 'breakdown', userId, adSetId, breakdown, datePreset || since || '', until || '',
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

    const { metaAdSetId } = await resolveMetaAdSetId(userId, adSetId);

    const rows = await metaService.getEntityBreakdown(
      metaAdSetId,
      user.metaAuth.accessToken,
      breakdown,
      dateParams
    );

    const responseBody = { success: true, breakdown, data: rows };
    requestCache.set(cacheKey, responseBody, ADSETS_CACHE_TTL_MS);
    return res.json(responseBody);
  })
);

export default router;