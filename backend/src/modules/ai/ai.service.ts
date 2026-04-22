import OpenAI from 'openai';
import mongoose from 'mongoose';
import { logger } from '../../config';
import { AppError } from '../../middleware/errorHandler';
import { Ad } from '../../models/Ad';
import { Campaign } from '../../models/Campaign';
import { metaService } from '../../services/MetaService';
import { aiService } from '../../services/AIService';
import { User } from '../../models/User';
import { AIInsight } from './ai-insight.model';
import {
  AIAnalysisOutput,
  AnalyzeAudienceInput,
  AnalyzeCreativesInput,
  GetInsightHistoryInput,
  ImprovementSuggestionsInput,
  ImprovementSuggestionsResult,
  InsightHistoryItem,
  OptimizeBudgetInput,
  PerformanceReviewInput,
  PerformanceReviewOutput,
} from './ai.types';

const extractConversions = (conversions: unknown): number => {
  if (Array.isArray(conversions)) {
    const purchase = conversions.find(
      (action: any) =>
        action.action_type === 'purchase' ||
        action.action_type === 'offsite_conversion.fb_pixel_purchase'
    );

    return purchase ? Number(purchase.value) || 0 : 0;
  }

  return Number(conversions) || 0;
};

const buildPerformanceHistorySummary = (result: Record<string, any>) => {
  return result.overallSummary || result.overall_assessment || result.message || 'Performance review generated.';
};

const buildPerformanceHistoryInsights = (result: Record<string, any>) => {
  const campaignInsights = Array.isArray(result.campaigns)
    ? result.campaigns.flatMap((campaign: any) => campaign.insights || []).filter(Boolean)
    : [];

  const legacyInsights = [
    ...(Array.isArray(result.top_performing_campaigns) ? result.top_performing_campaigns : []),
    ...(Array.isArray(result.underperforming_campaigns) ? result.underperforming_campaigns : []),
  ];

  return [...campaignInsights, ...legacyInsights].slice(0, 6);
};

const buildPerformanceHistoryRecommendations = (result: Record<string, any>) => {
  const campaignRecommendations = Array.isArray(result.campaigns)
    ? result.campaigns.flatMap((campaign: any) => campaign.recommendations || []).filter(Boolean)
    : [];

  const legacyRecommendations = [
    ...(Array.isArray(result.quick_wins) ? result.quick_wins : []),
    ...(Array.isArray(result.strategic_changes) ? result.strategic_changes : []),
    ...(Array.isArray(result.budget_reallocation) ? result.budget_reallocation : []),
  ];

  return [...campaignRecommendations, ...legacyRecommendations].slice(0, 6);
};

const normaliseInsightHistoryItem = (insight: any): InsightHistoryItem => {
  const result = insight.result || {};
  const summary =
    insight.output?.summary ||
    buildPerformanceHistorySummary(result) ||
    (typeof insight.output?.alignmentScore === 'number'
      ? `Audience alignment score: ${insight.output.alignmentScore}/10`
      : 'AI insight generated.');

  const insights =
    insight.output?.insights ||
    insight.output?.gaps ||
    buildPerformanceHistoryInsights(result) ||
    [];

  const recommendations =
    insight.output?.recommendations ||
    buildPerformanceHistoryRecommendations(result) ||
    [];

  return {
    _id: insight._id,
    type: insight.type,
    status: insight.status,
    createdAt: insight.createdAt,
    updatedAt: insight.updatedAt,
    score: insight.output?.alignmentScore,
    summary,
    insights,
    recommendations,
    result,
  };
};

export class AIOrchestrationService {
  async analyzeAudience(input: AnalyzeAudienceInput): Promise<AIAnalysisOutput & { campaignCount: number; isPlaceholder?: boolean; message?: string }> {
    const { userId, adAccountId, audienceDefinition, campaignIds } = input;

    logger.info('[AIController] analyze-audience requested', {
      userId: userId.toString(),
      adAccountId,
      campaignIdCount: campaignIds?.length || 0,
    });

    let campaigns = await Campaign.find({
      userId,
      adAccountId,
      status: { $in: ['ACTIVE', 'PAUSED'] },
    }).limit(20);

    if (campaignIds?.length) {
      const wantedIds = new Set(campaignIds);
      campaigns = campaigns.filter((campaign: any) => wantedIds.has(campaign.metaCampaignId) || wantedIds.has(campaign._id.toString()));
    }

    if (!campaigns.length) {
      logger.warn('[AIService] No stored campaigns found; attempting live Meta fetch', {
        userId: userId.toString(),
        adAccountId,
      });

      try {
        const user = await User.findById(userId).select('+metaAuth.accessToken').lean();
        if (user?.metaAuth?.accessToken) {
          const liveCampaigns = await metaService.getMetaCampaigns(
            user.metaAuth.accessToken,
            adAccountId,
            { preset: 'last_30d' }
          );

          campaigns = liveCampaigns
            .filter((campaign: any) => {
              if (!campaignIds?.length) {
                return true;
              }

              return campaignIds.includes(campaign.id);
            })
            .map((campaign: any) => {
              const insights = campaign.insights?.data?.[0] || {};

              return {
                metaCampaignId: campaign.id,
                name: campaign.name || 'Unnamed Campaign',
                status: campaign.status || 'ACTIVE',
                objective: campaign.objective || '',
                metrics: {
                  spend: Number(insights.spend) || 0,
                  impressions: Number(insights.impressions) || 0,
                  clicks: Number(insights.clicks) || 0,
                  ctr: Number(insights.ctr) || 0,
                  cpc: Number(insights.cpc) || 0,
                  conversions: extractConversions(insights.conversions),
                  roas: Number(insights.purchase_roas?.[0]?.value) || 0,
                },
              } as any;
            });
        }
      } catch (error) {
        logger.warn('[AIService] Live Meta campaign fetch failed for audience analysis', {
          userId: userId.toString(),
          adAccountId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    const validCampaigns = campaigns.filter((campaign: any) => {
      const metrics = campaign.metrics || {};
      return Number(metrics.spend) > 0 || Number(metrics.impressions) > 0 || Number(metrics.clicks) > 0;
    });

    const campaignsForAnalysis = validCampaigns.length > 0 ? validCampaigns : campaigns;

    if (!campaignsForAnalysis.length) {
      return {
        alignment_score: 5,
        gaps: [
          'No campaigns found in your ad account for the selected period.',
          'Without campaign data we cannot analyze how your audience targeting aligns with actual performance.',
          'Run campaigns for at least 24 hours with a meaningful budget to gather reliable data.',
        ],
        recommendations: [
          'Launch a campaign targeting the audience definition you provided.',
          'Set a daily budget of at least $10-20 to gather sufficient data.',
          'Return here after 24-48 hours of campaign activity.',
        ],
        isPlaceholder: true,
        campaignCount: 0,
        message: 'No campaign data yet. Launch campaigns to enable AI audience insights.',
      };
    }

    const result = await aiService.analyzeAudienceAlignment(
      userId,
      audienceDefinition,
      campaignsForAnalysis as any,
      adAccountId
    );

    return {
      ...result,
      campaignCount: campaignsForAnalysis.length,
    };
  }

  async generatePerformanceReview(input: PerformanceReviewInput): Promise<PerformanceReviewOutput | Record<string, unknown>> {
    const { userId, adAccountId } = input;

    logger.info('[AIController] performance-review requested', {
      userId: userId.toString(),
      adAccountId,
    });

    try {
      const dbCampaigns = await Campaign.find({
        userId,
        adAccountId,
      }).lean();

      let activeCampaigns = dbCampaigns;
      const userWithToken = await User.findById(userId).select('+metaAuth.accessToken');
      const accessToken = userWithToken?.metaAuth?.accessToken;

      try {
        if (accessToken) {
          const metaCampaigns = await metaService.getMetaCampaigns(
            accessToken,
            adAccountId,
            { preset: 'last_30d' }
          );

          if (metaCampaigns?.length) {
            activeCampaigns = metaCampaigns.map((metaCampaign: any) => {
              const dbCampaign = dbCampaigns.find(
                (campaign) => campaign.metaCampaignId === metaCampaign.id || campaign.name === metaCampaign.name
              );

              const metaInsights = metaCampaign.insights?.data?.[0];
              const metaSpend = metaInsights?.spend ? Number(metaInsights.spend) : 0;
              const dbSpend = dbCampaign?.metrics?.spend ? Number(dbCampaign.metrics.spend) : 0;
              const spend = metaSpend > 0 ? metaSpend : dbSpend;
              const purchaseRoas = Array.isArray(metaInsights?.purchase_roas)
                ? Number(metaInsights.purchase_roas[0]?.value || 0)
                : Number(metaInsights?.purchase_roas || 0);
              const ctr = metaInsights?.ctr
                ? Number(metaInsights.ctr)
                : (dbCampaign?.metrics?.ctr || 0);
              const conversions = extractConversions(metaInsights?.conversions)
                || (dbCampaign?.metrics?.conversions || 0);
              const cpa = conversions > 0
                ? (metaInsights?.spend ? Number(metaInsights.spend) : 0) / conversions
                : (dbCampaign?.metrics?.cpa || 0);

              return {
                ...dbCampaign,
                ...metaCampaign,
                spend,
                ctr,
                roas: purchaseRoas || (dbCampaign?.metrics?.roas || 0),
                conversions,
                cpa,
                cpc: metaInsights?.cpc ? Number(metaInsights.cpc) : (dbCampaign?.metrics?.cpc || 0),
                cpm: metaInsights?.cpm ? Number(metaInsights.cpm) : (dbCampaign?.metrics?.cpm || 0),
                clicks: metaInsights?.clicks ? Number(metaInsights.clicks) : (dbCampaign?.metrics?.clicks || 0),
                impressions: metaInsights?.impressions ? Number(metaInsights.impressions) : (dbCampaign?.metrics?.impressions || 0),
              };
            });
          }
        }
      } catch (error) {
        logger.warn('[AIService] Meta campaign hydration failed for performance review', {
          userId: userId.toString(),
          adAccountId,
          error: error instanceof Error ? error.message : error,
        });
      }

      const campaignsWithSignals = activeCampaigns.filter((campaign: any) => {
        const spend = Number(campaign.spend) || 0;
        const impressions = Number(campaign.impressions) || 0;
        const clicks = Number(campaign.clicks) || 0;
        return spend > 0 || impressions > 0 || clicks > 0;
      });

      const campaignsForSignal = campaignsWithSignals.length > 0 ? campaignsWithSignals : activeCampaigns;

      if (!campaignsForSignal.length) {
        return {
          overall_assessment: 'No campaigns with spending have been detected yet.',
          top_performing_campaigns: [],
          underperforming_campaigns: [],
          budget_reallocation: [],
          quick_wins: [
            'Create your first campaign with clear objectives',
            'Start with a daily budget of $10-20 USD for testing',
            'Run the campaign for at least 7 days to collect baseline metrics',
          ],
          strategic_changes: [
            'Define clear KPIs for your campaigns (CTR, ROAS, CPA targets)',
            'A/B test different audience segments to find your best performers',
            'Implement conversion tracking to measure ROI accurately',
            'Once campaigns are running with data, you will get detailed performance recommendations',
          ],
          isPlaceholder: true,
          message: 'No campaigns available for performance analysis. Launch campaigns to enable detailed insights.',
        };
      }

      const campaignsForReview = await Promise.all(
        campaignsForSignal.map(async (campaign: any) => {
          const campaignMetaId = campaign.id || campaign.metaCampaignId;

          try {
            if (accessToken && campaignMetaId) {
              const adSets = await metaService.getCampaignAdSets(
                accessToken,
                campaignMetaId,
                { preset: 'last_30d' }
              );

              const ads = await Promise.all(
                (adSets || []).map(async (adSet: any) => {
                  const adSetMetaId = adSet.id;
                  if (!adSetMetaId) {
                    return [];
                  }

                  const rawAds = await metaService.getAdSetAds(
                    accessToken,
                    adSetMetaId,
                    { preset: 'last_30d' }
                  );

                  return rawAds.map((ad: any) => {
                    const adInsights = ad.insights?.data?.[0];

                    return {
                      id: ad.id,
                      name: ad.name,
                      spend: adInsights?.spend ? Number(adInsights.spend) : 0,
                      impressions: adInsights?.impressions ? Number(adInsights.impressions) : 0,
                      clicks: adInsights?.clicks ? Number(adInsights.clicks) : 0,
                      ctr: adInsights?.ctr ? Number(adInsights.ctr) : 0,
                      conversions: extractConversions(adInsights?.conversions),
                    };
                  });
                })
              );

              return { ...campaign, ads: ads.flat() };
            }
          } catch (error) {
            logger.warn('[AIService] Failed to fetch ads for campaign review', {
              campaignMetaId,
              error: error instanceof Error ? error.message : error,
            });
          }

          return { ...campaign, ads: [] };
        })
      );

      try {
        const result = await aiService.generatePerformanceReview(userId, adAccountId, campaignsForReview);

        await AIInsight.create({
          userId,
          adAccountId,
          type: 'performance_review',
          input: {
            campaignData: campaignsForReview,
            metrics: {
              campaignCount: campaignsForReview.length,
              generatedAt: new Date().toISOString(),
            },
          },
          output: {
            summary: buildPerformanceHistorySummary(result as Record<string, any>),
            insights: buildPerformanceHistoryInsights(result as Record<string, any>),
            recommendations: buildPerformanceHistoryRecommendations(result as Record<string, any>),
            rawResponse: JSON.stringify(result),
          },
          result,
          status: 'completed',
        });

        return result;
      } catch (error) {
        logger.warn('[AIService] Falling back to rule-based performance review', {
          userId: userId.toString(),
          adAccountId,
          error: error instanceof Error ? error.message : error,
        });

        const totalSpend = campaignsForReview.reduce((sum: number, campaign: any) => sum + (Number(campaign.spend) || 0), 0);
        const avgCTR = campaignsForReview.length
          ? campaignsForReview.reduce((sum: number, campaign: any) => sum + (Number(campaign.ctr) || 0), 0) / campaignsForReview.length
          : 0;
        const totalConversions = campaignsForReview.reduce((sum: number, campaign: any) => sum + (Number(campaign.conversions) || 0), 0);

        const fallback = {
          overallSummary: `Account has ${campaignsForReview.length} active campaign(s) with total spend of $${totalSpend.toFixed(2)}, average CTR of ${avgCTR.toFixed(2)}%, and ${totalConversions} total conversions over the last 30 days.`,
          campaigns: campaignsForReview.map((campaign: any) => {
            const ctr = Number(campaign.ctr) || 0;
            const roas = Number(campaign.roas) || 0;
            const spend = Number(campaign.spend) || 0;
            const status = roas >= 2 && ctr >= 1 ? 'good' : roas >= 1 || ctr >= 0.5 ? 'average' : 'poor';

            return {
              campaignId: campaign.id || campaign.metaCampaignId || '',
              campaignName: campaign.name || 'Unknown Campaign',
              status,
              spend,
              ctr,
              roas,
              conversions: Number(campaign.conversions) || 0,
              insights: ctr < 1
                ? [`CTR of ${ctr.toFixed(2)}% is below the 1% benchmark; refresh creatives or tighten targeting.`]
                : [`CTR of ${ctr.toFixed(2)}% is on track.`],
              recommendations: spend > 0 && roas < 1
                ? ['ROAS is below 1x; pause low-performing ad sets and reallocate budget.']
                : ['Monitor performance daily and scale winning ad sets by 20% when ROAS exceeds 2x.'],
              ads: [],
            };
          }),
        };

        try {
          await AIInsight.create({
            userId,
            adAccountId,
            type: 'performance_review',
            input: {
              campaignData: campaignsForReview,
              metrics: {
                campaignCount: campaignsForReview.length,
                generatedAt: new Date().toISOString(),
              },
            },
            output: {
              summary: fallback.overallSummary,
              insights: fallback.campaigns.flatMap((campaign: any) => campaign.insights),
              recommendations: fallback.campaigns.flatMap((campaign: any) => campaign.recommendations),
              rawResponse: JSON.stringify(fallback),
            },
            result: fallback,
            status: 'failed',
            error: error instanceof Error ? error.message : 'AI provider unavailable',
          });
        } catch (dbError) {
          logger.warn('[AIService] Failed to persist fallback performance insight', {
            userId: userId.toString(),
            adAccountId,
            error: dbError instanceof Error ? dbError.message : dbError,
          });
        }

        return fallback;
      }
    } catch (error) {
      logger.error('[AIService] Performance review failed before analysis', {
        userId: userId.toString(),
        adAccountId,
        error: error instanceof Error ? error.message : error,
      });

      return {
        overallSummary: 'Could not load campaign data. Please check your Meta Ads connection and try again.',
        campaigns: [],
      };
    }
  }

  async analyzeCreatives(input: AnalyzeCreativesInput) {
    const ads = await Ad.find({ userId: input.userId, adAccountId: input.adAccountId }).limit(30);

    if (!ads.length) {
      return {
        analysis: 'No ads available for creative analysis',
        insights: [
          'You have not created any ads yet. Start by creating ad creatives to receive AI-powered performance analysis.',
          'Upload or create multiple creative variations to test what resonates with your audience.',
          'At least 3-5 different creatives are recommended for effective A/B testing and performance comparison.',
        ],
        recommendations: [
          'Create your first ad creative with headline, copy, and visual variants.',
          'Launch ads with different creative variations to test performance.',
          'Run each creative for at least 3-5 days before making changes.',
          'Return after ads are live to analyze fatigue and optimization opportunities.',
        ],
        creative_count: 0,
        isPlaceholder: true,
        message: 'No ads available for analysis. Create ads to enable creative performance analysis.',
      };
    }

    return aiService.analyzeCreativePerformance(ads as any);
  }

  async optimizeBudget(input: OptimizeBudgetInput) {
    const campaigns = await Campaign.find({
      userId: input.userId,
      adAccountId: input.adAccountId,
      status: 'ACTIVE',
    });

    if (!campaigns.length) {
      return {
        current_allocation: [],
        optimized_allocation: [
          {
            recommendation: 'Launch your first campaign',
            suggested_budget: input.totalBudget,
            expected_roi: 'Pending (need campaign data)',
          },
        ],
        expected_roi_uplift: 0,
        key_recommendations: [
          'No active campaigns found. Start by creating campaigns to get budget optimization recommendations.',
          'Create at least 2-3 campaigns with different targeting strategies to enable budget optimization analysis.',
          'Run campaigns for 7+ days to gather performance data for AI analysis.',
          'Once campaigns are running, AI will recommend optimal budget allocation across them.',
        ],
        estimated_monthly_impact: 'Pending',
        isPlaceholder: true,
        message: 'No campaigns available for budget optimization. Launch campaigns to enable analysis.',
      };
    }

    return aiService.optimizeBudgetAllocation(campaigns as any, input.totalBudget);
  }

  async getHistory(input: GetInsightHistoryInput) {
    const insights = await AIInsight.find({ userId: input.userId })
      .sort({ createdAt: -1 })
      .limit(input.limit)
      .lean();

    return {
      insights: insights.map(normaliseInsightHistoryItem),
      total: insights.length,
    };
  }

  async generateImprovements(input: ImprovementSuggestionsInput): Promise<ImprovementSuggestionsResult> {
    const { adAccountId, campaignId, adsetId, metrics, userId } = input;

    let contextMetrics = metrics || {};
    let contextName = 'your campaigns';

    try {
      if (adsetId) {
        const { AdSet } = await import('../../models/AdSet');
        const adset = await AdSet.findOne({ userId, metaAdSetId: adsetId }).lean().catch(() => null);
        if (adset) {
          contextName = adset.name;
        }
      } else if (campaignId) {
        const campaign = await Campaign.findOne({
          userId,
          $or: [
            { metaCampaignId: campaignId },
            ...(campaignId.length === 24 ? [{ _id: campaignId }] : []),
          ],
        }).lean().catch(() => null);

        if (campaign) {
          contextName = campaign.name;
          contextMetrics = metrics || campaign.metrics || {};
        }
      } else if (adAccountId) {
        const campaign = await Campaign.findOne({ userId, adAccountId }).sort({ updatedAt: -1 }).lean().catch(() => null);
        if (campaign) {
          contextName = campaign.name;
          contextMetrics = metrics || campaign.metrics || {};
        }
      }

      const spend = Number(contextMetrics.spend || 0);
      const ctr = Number(contextMetrics.ctr || 0);
      const conversions = Number(contextMetrics.conversions || 0);
      const roas = Number(contextMetrics.roas || 0);
      const cpa = Number(contextMetrics.cpa || 0);

      const suggestions: string[] = [];

      if (ctr < 1) {
        suggestions.push('Your CTR is below 1%; refresh creatives with a stronger hook or tighter audience match.');
      } else if (ctr < 2) {
        suggestions.push('CTR is moderate. A/B test 2-3 new headline variants to push it above 2%.');
      } else {
        suggestions.push('CTR is healthy. Focus next on improving post-click conversion rate.');
      }

      if (conversions === 0 && spend > 0) {
        suggestions.push('No conversions detected despite spend. Verify your conversion pixel and landing page path.');
      } else if (cpa > 50) {
        suggestions.push(`CPA is high at $${cpa.toFixed(0)}. Narrow targeting or pause low-CTR ad sets.`);
      } else if (conversions > 0) {
        suggestions.push('Conversions are happening. Scale the best-performing ad sets with a controlled budget increase.');
      }

      if (roas > 0 && roas < 1) {
        suggestions.push('ROAS is below 1x. Pause underperforming ads before increasing budget.');
      } else if (roas >= 3) {
        suggestions.push('ROAS is strong. This campaign is a candidate for aggressive but monitored scaling.');
      }

      if (spend > 0 && spend < 10) {
        suggestions.push('Daily spend is very low. Increase budget enough to exit Meta learning phase and gather usable data.');
      }

      suggestions.push('Test Lookalike Audiences based on converters to extend reach into higher-intent segments.');
      suggestions.push('Add a video creative variant to test lower CPM and stronger first-frame engagement.');

      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const prompt = `You are a Meta Ads performance expert. Given these ad metrics for "${contextName}":
- Spend: $${spend.toFixed(2)}
- CTR: ${ctr.toFixed(2)}%
- Conversions: ${conversions}
- ROAS: ${roas.toFixed(2)}x
- CPA: $${cpa.toFixed(2)}

Provide exactly 3 specific, actionable improvement suggestions. Each suggestion should be 1-2 sentences. Return as JSON array of strings.`;

        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 300,
        });

        const rawText = completion.choices[0]?.message?.content || '[]';
        const aiSuggestions = JSON.parse(rawText.match(/\[[\s\S]*\]/)?.[0] || '[]');
        if (Array.isArray(aiSuggestions) && aiSuggestions.length) {
          return {
            suggestions: aiSuggestions,
            source: 'ai',
            contextName,
          };
        }
      } catch (error) {
        logger.warn('[AIService] AI improvement suggestions unavailable; returning rule-based suggestions', {
          userId: userId.toString(),
          adAccountId,
          campaignId,
          adsetId,
          error: error instanceof Error ? error.message : error,
        });
      }

      return {
        suggestions: suggestions.slice(0, 5),
        source: 'rules',
        contextName,
      };
    } catch (error) {
      logger.error('[AIService] Failed to build improvement suggestions', {
        userId: userId.toString(),
        adAccountId,
        campaignId,
        adsetId,
        error: error instanceof Error ? error.message : error,
      });

      return {
        suggestions: [
          'Refresh your ad creatives every 2-3 weeks to prevent audience fatigue.',
          'Test at least 3 ad variations per ad set for reliable performance data.',
          'Use retargeting audiences to re-engage website visitors and cart abandoners.',
          'Keep landing page load time under 3 seconds to protect conversion rate.',
          'Schedule ads during peak hours once you confirm when your audience converts.',
        ],
        source: 'fallback',
        contextName: 'your campaigns',
      };
    }
  }

  toObjectId(userId?: string) {
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    return new mongoose.Types.ObjectId(userId);
  }
}

export const aiOrchestrationService = new AIOrchestrationService();
