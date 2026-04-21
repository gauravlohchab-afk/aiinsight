import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { redisConnection, logger } from '../config';
import { User } from '../models/User';
import { Campaign } from '../models/Campaign';
import { AdSet } from '../models/AdSet';
import { Ad } from '../models/Ad';
import { metaService } from '../services/MetaService';
import { analyticsService } from '../services/AnalyticsService';
import mongoose from 'mongoose';

const REDIS_ENABLED = process.env.REDIS_HOST !== 'disabled';

// ── Queue Definitions ─────────────────────────────────────────────────────────
export const syncQueue: Queue | null = REDIS_ENABLED ? new Queue('meta-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
}) : null;

export const aiQueue: Queue | null = REDIS_ENABLED ? new Queue('ai-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 10000 },
    removeOnComplete: { count: 50 },
  },
}) : null;

// ── Job Types ─────────────────────────────────────────────────────────────────
interface SyncJobData {
  userId: string;
  adAccountId: string;
  jobType: 'full_sync' | 'metrics_only' | 'campaigns_only';
  dateRange?: { since: string; until: string };
}

interface AIJobData {
  userId: string;
  insightId: string;
  type: string;
}

// ── Meta Sync Worker ──────────────────────────────────────────────────────────
export const syncWorker = REDIS_ENABLED ? new Worker<SyncJobData>(
  'meta-sync',
  async (job: Job<SyncJobData>) => {
    const { userId, adAccountId, jobType } = job.data;
    const startTime = Date.now();

    logger.info(`🔄 [SyncWorker] Starting ${jobType} for user ${userId}, account ${adAccountId}`);

    try {
      // ── Fetch User & Validate Token ────────────────────────────────────
      const user = await User.findById(userId).select('+metaAuth.accessToken');

      if (!user) {
        throw new Error(`❌ User ${userId} not found in database`);
      }

      if (!user.metaAuth?.accessToken) {
        logger.warn(`⚠️ User ${userId} has no valid Meta access token`, {
          metaAuthExists: !!user.metaAuth,
          tokenExists: !!user.metaAuth?.accessToken,
        });
        throw new Error(
          `Invalid or expired Meta access token. User needs to reconnect their Meta account.`
        );
      }

      const accessToken = user.metaAuth.accessToken;
      const formattedAccountId = adAccountId.startsWith('act_')
        ? adAccountId
        : `act_${adAccountId}`;

      const dateRange = job.data.dateRange || {
        since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        until: new Date().toISOString().split('T')[0],
      };

      await job.updateProgress(5);

      // ── Sync Campaigns ─────────────────────────────────────────────────
      if (jobType === 'full_sync' || jobType === 'campaigns_only') {
        try {
          logger.info(`📊 [SyncWorker] Fetching campaigns for ${formattedAccountId}`);
          const rawCampaigns = await metaService.getCampaigns(
            accessToken,
            formattedAccountId,
            dateRange
          );

          if (!rawCampaigns || rawCampaigns.length === 0) {
            logger.warn(`⚠️ [SyncWorker] No campaigns found for ${formattedAccountId}`);
          } else {
            logger.info(`✅ [SyncWorker] Found ${rawCampaigns.length} campaigns`);
          }

          await job.updateProgress(30);

          let successCount = 0;
          let errorCount = 0;

          for (const raw of rawCampaigns) {
            try {
              // ── SAFE: Use optional chaining to access insights ────────
              const insight = (raw.insights?.data?.[0] || {}) as Record<string, any>;
              
              // ── SAFE: Extract metrics with fallbacks ─────────────────
              const spend = Number(insight.spend || 0);
              const ctr = Number(insight.ctr || 0);
              const cpc = Number(insight.cpc || 0);
              const impressions = Number(insight.impressions || 0);
              const clicks = Number(insight.clicks || 0);

              const normalizedMetrics = insight && Object.keys(insight).length > 0
                ? metaService.normalizeMetrics(insight as any)
                : {};

              console.log('📦 [SyncWorker] Processing campaign:', {
                campaignId: raw.id,
                campaignName: raw.name,
                hasInsights: !!raw.insights,
                insightsDataLength: raw.insights?.data?.length || 0,
                spend,
                ctr,
              });

              const campaignDoc = await Campaign.findOneAndUpdate(
                { userId, metaCampaignId: raw.id },
                {
                  $set: {
                    userId: new mongoose.Types.ObjectId(userId),
                    metaCampaignId: raw.id,
                    adAccountId: formattedAccountId,
                    name: raw.name,
                    status: raw.status as any,
                    objective: raw.objective,
                    buyingType: raw.buying_type,
                    budget: {
                      daily: raw.daily_budget ? parseInt(raw.daily_budget) / 100 : undefined,
                      lifetime: raw.lifetime_budget
                        ? parseInt(raw.lifetime_budget) / 100
                        : undefined,
                      currency: 'USD',
                    },
                    schedule: {
                      startTime: raw.start_time ? new Date(raw.start_time) : undefined,
                      endTime: raw.stop_time ? new Date(raw.stop_time) : undefined,
                    },
                    metrics: normalizedMetrics,
                    lastSyncedAt: new Date(),
                  },
                  $push: normalizedMetrics && Object.keys(normalizedMetrics).length > 0
                    ? {
                        historicalMetrics: {
                          $each: [{ ...normalizedMetrics, date: new Date() }],
                          $slice: -90, // Keep last 90 days
                        },
                      }
                    : {},
                },
                { upsert: true, new: true }
              );

              if (campaignDoc) {
                // Calculate health score
                const { score } = analyticsService.calculateHealthScore(
                  campaignDoc.metrics,
                  campaignDoc.budget
                );

                // Detect anomalies if we have historical data
                const anomalies =
                  campaignDoc.historicalMetrics.length >= 2
                    ? analyticsService.detectAnomalies(
                        campaignDoc.metrics,
                        campaignDoc.historicalMetrics[
                          campaignDoc.historicalMetrics.length - 2
                        ]
                      )
                    : [];

                // Generate suggestions
                const suggestions = analyticsService.generateSuggestions(campaignDoc);

                await Campaign.findByIdAndUpdate(campaignDoc._id, {
                  healthScore: score,
                  anomalies: anomalies.map((a) => ({
                    ...a,
                    detectedAt: new Date(),
                  })),
                  suggestions: suggestions.map((s) => ({
                    ...s,
                    applied: false,
                    createdAt: new Date(),
                  })),
                });

                successCount++;
              }
            } catch (err) {
              errorCount++;
              logger.error(`❌ [SyncWorker] Error processing campaign ${raw.id}:`, {
                error: (err as any).message,
                campaignId: raw.id,
                campaignName: raw.name,
              });
              // Continue with next campaign instead of failing entire job
            }
          }

          logger.info(
            `📈 [SyncWorker] Campaign sync complete: ${successCount} succeeded, ${errorCount} failed`
          );
          await job.updateProgress(60);
        } catch (err) {
          logger.error('💥 [SyncWorker] Fatal error during campaign sync:', {
            error: (err as any).message,
            code: (err as any).code,
            statusCode: (err as any).response?.status,
          });
          throw err;
        }
      }

      // ── Sync Ad Sets ───────────────────────────────────────────────────
      if (jobType === 'full_sync') {
        try {
          logger.info(`📊 [SyncWorker] Fetching ad sets for ${formattedAccountId}`);
          const rawAdSets = await metaService.getAdSets(accessToken, formattedAccountId);

          logger.info(`✅ [SyncWorker] Found ${rawAdSets.length} ad sets`);

          let adSetSuccessCount = 0;
          let adSetErrorCount = 0;

          for (const raw of rawAdSets as any[]) {
            try {
              const campaign = await Campaign.findOne({
                userId,
                metaCampaignId: raw.campaign_id,
              });
              if (!campaign) continue;

              const metricsData = raw.insights?.data?.[0];
              const normalizedMetrics = metricsData
                ? metaService.normalizeMetrics(metricsData)
                : {};

              const fatigue = await detectAdSetFatigue(raw, normalizedMetrics);

              await AdSet.findOneAndUpdate(
                { userId, metaAdSetId: raw.id },
                {
                  $set: {
                    userId: new mongoose.Types.ObjectId(userId),
                    campaignId: campaign._id,
                    metaAdSetId: raw.id,
                    metaCampaignId: raw.campaign_id,
                    adAccountId: formattedAccountId,
                    name: raw.name,
                    status: raw.status,
                    targeting: raw.targeting || {},
                    budget: {
                      daily: raw.daily_budget
                        ? parseInt(raw.daily_budget) / 100
                        : undefined,
                      lifetime: raw.lifetime_budget
                        ? parseInt(raw.lifetime_budget) / 100
                        : undefined,
                      currency: 'USD',
                      bidAmount: raw.bid_amount
                        ? parseInt(raw.bid_amount) / 100
                        : undefined,
                      bidStrategy: raw.bid_strategy,
                    },
                    optimization: {
                      goal: raw.optimization_goal,
                      billingEvent: raw.billing_event,
                    },
                    metrics: normalizedMetrics,
                    creativeFatigue: fatigue,
                    lastSyncedAt: new Date(),
                  },
                },
                { upsert: true }
              );

              adSetSuccessCount++;
            } catch (err) {
              adSetErrorCount++;
              logger.error(`❌ [SyncWorker] Error processing adset ${(raw as any).id}:`, {
                error: (err as any).message,
              });
            }
          }

          logger.info(
            `📈 [SyncWorker] Ad Set sync complete: ${adSetSuccessCount} succeeded, ${adSetErrorCount} failed`
          );
          await job.updateProgress(80);

          // ── Sync Ads ───────────────────────────────────────────────────
          try {
            logger.info(`📊 [SyncWorker] Fetching ads for ${formattedAccountId}`);
            const rawAds = await metaService.getAds(accessToken, formattedAccountId);

            logger.info(`✅ [SyncWorker] Found ${rawAds.length} ads`);

            let adSuccessCount = 0;
            let adErrorCount = 0;

            for (const raw of rawAds as any[]) {
              try {
                const [campaign, adSet] = await Promise.all([
                  Campaign.findOne({ userId, metaCampaignId: raw.campaign_id }),
                  AdSet.findOne({ userId, metaAdSetId: raw.adset_id }),
                ]);

                if (!campaign || !adSet) continue;

                const metricsData = raw.insights?.data?.[0];
                const normalizedMetrics = metricsData
                  ? metaService.normalizeMetrics(metricsData)
                  : {};

                await Ad.findOneAndUpdate(
                  { userId, metaAdId: raw.id },
                  {
                    $set: {
                      userId: new mongoose.Types.ObjectId(userId),
                      adSetId: adSet._id,
                      campaignId: campaign._id,
                      metaAdId: raw.id,
                      metaAdSetId: raw.adset_id,
                      metaCampaignId: raw.campaign_id,
                      adAccountId: formattedAccountId,
                      name: raw.name,
                      status: raw.status,
                      creative: {
                        metaCreativeId: raw.creative?.id,
                        title: raw.creative?.title,
                        body: raw.creative?.body,
                        callToAction: raw.creative?.call_to_action_type,
                        imageUrl: raw.creative?.image_url,
                        linkUrl: raw.creative?.object_url,
                      },
                      metrics: normalizedMetrics,
                      lastSyncedAt: new Date(),
                    },
                  },
                  { upsert: true }
                );

                adSuccessCount++;
              } catch (err) {
                adErrorCount++;
                logger.error(`❌ [SyncWorker] Error processing ad ${(raw as any).id}:`, {
                  error: (err as any).message,
                });
              }
            }

            logger.info(
              `📈 [SyncWorker] Ad sync complete: ${adSuccessCount} succeeded, ${adErrorCount} failed`
            );
          } catch (err) {
            logger.error('💥 [SyncWorker] Fatal error during ad fetch:', {
              error: (err as any).message,
            });
            // Don't throw here - let campaigns be synced at least
          }
        } catch (err) {
          logger.error('💥 [SyncWorker] Fatal error during ad set sync:', {
            error: (err as any).message,
          });
          // Continue despite ad set errors
        }
      }

      await job.updateProgress(100);

      const duration = Date.now() - startTime;
      logger.info(`✅ [SyncWorker] Completed ${jobType} for user ${userId}`, {
        duration: `${duration}ms`,
        adAccountId: formattedAccountId,
      });

      return {
        success: true,
        adAccountId: formattedAccountId,
        jobType,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      logger.error('💥 [SyncWorker] FATAL JOB FAILURE', {
        userId,
        adAccountId,
        jobType,
        error: error.message,
        code: error.code,
        statusCode: error.response?.status,
        duration: `${duration}ms`,
      });

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 3,
    limiter: {
      max: 10,
      duration: 60000, // 10 jobs per minute (Meta API rate limits)
    },
  }
) : null;

// ── Helper Functions ───────────────────────────────────────────────────────────
async function detectAdSetFatigue(
  raw: any,
  currentMetrics: any
): Promise<{ detected: boolean; ctrDeclinePercentage?: number }> {
  // Would check historical CTR trend here
  if (currentMetrics.ctr < 0.5 && currentMetrics.frequency > 3) {
    return {
      detected: true,
      ctrDeclinePercentage: 25,
    };
  }
  return { detected: false };
}

// ── Worker Event Handlers ──────────────────────────────────────────────────────
if (syncWorker) {
  syncWorker.on('completed', (job: Job) => {
    logger.info(`[SyncWorker] Job ${job.id} completed`);
  });

  syncWorker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error(`[SyncWorker] Job ${job?.id} failed:`, err.message);
  });

  syncWorker.on('error', (err: Error) => {
    logger.error('[SyncWorker] Worker error:', err);
  });
}

// ── Scheduled Sync ─────────────────────────────────────────────────────────────
export async function schedulePeriodicSync(): Promise<void> {
  if (!syncQueue) {
    logger.warn('[SyncWorker] Redis disabled - periodic sync not available');
    return;
  }
  // Schedule sync every 6 hours for all connected users
  await syncQueue.add(
    'scheduled-sync',
    { userId: 'all', adAccountId: 'all', jobType: 'metrics_only' },
    {
      repeat: { pattern: '0 */6 * * *' }, // Every 6 hours
      jobId: 'periodic-sync',
    }
  );
  logger.info('[SyncWorker] Periodic sync scheduled');
}

// ── Queue Helper ───────────────────────────────────────────────────────────────
export async function enqueueSyncJob(
  userId: string,
  adAccountId: string,
  jobType: SyncJobData['jobType'] = 'full_sync'
): Promise<void> {
  if (!syncQueue) {
    logger.warn('[SyncWorker] Redis disabled - sync job not enqueued');
    return;
  }
  await syncQueue.add(
    `sync-${userId}-${adAccountId}`,
    { userId, adAccountId, jobType },
    { jobId: `sync-${userId}-${adAccountId}-${Date.now()}` }
  );
  logger.info(`[SyncWorker] Enqueued ${jobType} for user ${userId}`);
}
