import { Router, Response } from 'express';
import { body, query } from 'express-validator';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { validateRequest, asyncHandler, AppError } from '../middleware/errorHandler';
import { aiService } from '../services/AIService';
import { metaService } from '../services/MetaService';
import { Campaign } from '../models/Campaign';
import { Ad } from '../models/Ad';
import { AIInsight } from '../models/AIInsight';
import { User } from '../models/User';
import mongoose from 'mongoose';

const router = Router();
router.use(authenticate);

// ── Helper: extract conversion count from Meta's actions array ────────────────
function extractConversions(conversions: any): number {
  if (Array.isArray(conversions)) {
    const purchase = conversions.find(
      (a: any) =>
        a.action_type === 'purchase' ||
        a.action_type === 'offsite_conversion.fb_pixel_purchase'
    );
    return purchase ? Number(purchase.value) || 0 : 0;
  }
  return Number(conversions) || 0;
}

function buildPerformanceHistorySummary(result: Record<string, any>) {
  return result.overallSummary || result.overall_assessment || result.message || 'Performance review generated.';
}

function buildPerformanceHistoryInsights(result: Record<string, any>) {
  const campaignInsights = Array.isArray(result.campaigns)
    ? result.campaigns.flatMap((campaign: any) => campaign.insights || []).filter(Boolean)
    : [];

  const legacyInsights = [
    ...(Array.isArray(result.top_performing_campaigns) ? result.top_performing_campaigns : []),
    ...(Array.isArray(result.underperforming_campaigns) ? result.underperforming_campaigns : []),
  ];

  return [...campaignInsights, ...legacyInsights].slice(0, 6);
}

function buildPerformanceHistoryRecommendations(result: Record<string, any>) {
  const campaignRecommendations = Array.isArray(result.campaigns)
    ? result.campaigns.flatMap((campaign: any) => campaign.recommendations || []).filter(Boolean)
    : [];

  const legacyRecommendations = [
    ...(Array.isArray(result.quick_wins) ? result.quick_wins : []),
    ...(Array.isArray(result.strategic_changes) ? result.strategic_changes : []),
    ...(Array.isArray(result.budget_reallocation) ? result.budget_reallocation : []),
  ];

  return [...campaignRecommendations, ...legacyRecommendations].slice(0, 6);
}

function normaliseInsightHistoryItem(insight: any) {
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
}

// ── Audience Analysis ─────────────────────────────────────────
router.post(
  '/analyze-audience',
  [
    body('adAccountId').notEmpty(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {

    if (!req.user?._id) throw new AppError('User not authenticated', 401);

    const userId = new mongoose.Types.ObjectId(req.user._id);
    const { adAccountId, audienceDefinition, campaignIds } = req.body;

    console.log('🧠 [AI] Analyzing audience for:', { adAccountId, hasAudienceDef: !!audienceDefinition });

    // Query all non-deleted campaigns (not just ACTIVE) so recently paused or syncing campaigns are included
    let campaigns = await Campaign.find({
      userId,
      adAccountId,
      status: { $in: ['ACTIVE', 'PAUSED'] },
    }).limit(20);

    // If DB is empty (sync hasn't run yet), try fetching live from Meta
    if (!campaigns.length) {
      console.warn('⚠️  [AI] No DB campaigns found — attempting live Meta fetch');
      try {
        const user = await User.findById(userId).select('+metaAuth.accessToken').lean();
        if (user?.metaAuth?.accessToken) {
          const liveCampaigns = await metaService.getMetaCampaigns(
            user.metaAuth.accessToken,
            adAccountId,
            { preset: 'last_30d' }
          );
          console.log(`📡 [AI] Live Meta campaigns fetched: ${liveCampaigns.length}`);

          // Shape live campaigns into a structure AIService can use
          campaigns = liveCampaigns.map((c: any) => {
            const insights = c.insights?.data?.[0] || {};
            return {
              metaCampaignId: c.id,
              name: c.name || 'Unnamed Campaign',
              status: c.status || 'ACTIVE',
              objective: c.objective || '',
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
      } catch (liveErr) {
        console.warn('⚠️  [AI] Live Meta fetch failed, continuing with empty campaigns:', liveErr);
      }
    }

    // Use all campaigns that have ANY signal (spend OR impressions OR clicks)
    const validCampaigns = campaigns.filter((c: any) => {
      const m = c.metrics || {};
      return (Number(m.spend) > 0 || Number(m.impressions) > 0 || Number(m.clicks) > 0);
    });

    const campaignsForAnalysis = validCampaigns.length > 0 ? validCampaigns : campaigns;

    if (!campaignsForAnalysis.length) {
      console.warn('⚠️  [AI] Audience analysis: no campaigns available at all');
      return res.json({
        success: true,
        data: {
          alignment_score: 5,
          gaps: [
            'No campaigns found in your ad account for the selected period.',
            'Without campaign data we cannot analyze how your audience targeting aligns with actual performance.',
            'Run campaigns for at least 24 hours with a meaningful budget to gather reliable data.',
          ],
          recommendations: [
            'Launch a campaign targeting the audience definition you provided.',
            'Set a daily budget of at least $10–20 to gather sufficient data.',
            'Return here after 24–48 hours of campaign activity.',
          ],
          isPlaceholder: true,
          campaignCount: 0,
          message: 'No campaign data yet. Launch campaigns to enable AI audience insights.',
        },
      });
    }

    console.log(`✅ [AI] Audience analysis using ${campaignsForAnalysis.length} campaign(s)`);
    const campaigns_to_use = campaignsForAnalysis;

    const result = await aiService.analyzeAudienceAlignment(
      userId,
      audienceDefinition,
      campaigns_to_use as any,
      adAccountId
    );

    res.json({
      success: true,
      data: { ...result, campaignCount: campaigns_to_use.length },
    });
  })
);

// ── Performance Review ────────────────────────────────────────
router.post(
  '/performance-review',
  [
    body('adAccountId').notEmpty(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?._id) throw new AppError('User not authenticated', 401);

    const userId = new mongoose.Types.ObjectId(req.user._id);
    const { adAccountId } = req.body;

    console.log('🧠 [AI] Generating performance review for:', { adAccountId });

    try {
    // Get database campaigns
    const dbCampaigns = await Campaign.find({
      userId,
      adAccountId,
    }).lean();

    console.log('📊 [AI] Database campaigns found:', dbCampaigns.length);

    // Try to fetch live Meta data if available
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
        
        console.log('📊 [AI] Meta campaigns fetched:', metaCampaigns?.length || 0);

        // Merge Meta data with DB data
        if (metaCampaigns?.length) {
          activeCampaigns = metaCampaigns.map((metaCampaign: any) => {
            const dbCampaign = dbCampaigns.find(
              (c) => c.metaCampaignId === metaCampaign.id || c.name === metaCampaign.name
            );

            // Extract spend from insights (Meta structure: insights.data[0].spend)
            const metaInsights = metaCampaign.insights?.data?.[0];
            const metaSpend = metaInsights?.spend ? Number(metaInsights.spend) : 0;
            
            // Fallback to database metrics.spend if available
            const dbSpend = dbCampaign?.metrics?.spend ? Number(dbCampaign.metrics.spend) : 0;
            
            // Use Meta spend if available, otherwise use database spend
            const spend = metaSpend > 0 ? metaSpend : dbSpend;
            const purchaseRoas = Array.isArray(metaInsights?.purchase_roas)
              ? Number(metaInsights.purchase_roas[0]?.value || 0)
              : Number(metaInsights?.purchase_roas || 0);

            // Meta returns CTR as percentage string (e.g. "2.34" = 2.34%) — keep as percentage
            const ctrPct = metaInsights?.ctr
              ? Number(metaInsights.ctr)
              : (dbCampaign?.metrics?.ctr || 0);

            // conversions is an array of actions — extract purchase count
            const conversionsCount = extractConversions(metaInsights?.conversions)
              || (dbCampaign?.metrics?.conversions || 0);

            // Meta has no cpa field — compute it from spend/conversions
            const metaSpendVal = metaInsights?.spend ? Number(metaInsights.spend) : 0;
            const computedCpa = conversionsCount > 0 ? metaSpendVal / conversionsCount : (dbCampaign?.metrics?.cpa || 0);

            const merged = {
              ...dbCampaign,
              ...metaCampaign,
              spend: spend,
              ctr: ctrPct,
              roas: purchaseRoas || (dbCampaign?.metrics?.roas || 0),
              conversions: conversionsCount,
              cpa: computedCpa,
              cpc: metaInsights?.cpc ? Number(metaInsights.cpc) : (dbCampaign?.metrics?.cpc || 0),
              cpm: metaInsights?.cpm ? Number(metaInsights.cpm) : (dbCampaign?.metrics?.cpm || 0),
              clicks: metaInsights?.clicks ? Number(metaInsights.clicks) : (dbCampaign?.metrics?.clicks || 0),
              impressions: metaInsights?.impressions ? Number(metaInsights.impressions) : (dbCampaign?.metrics?.impressions || 0),
            };

            console.log(`💰 [AI] Campaign "${merged.name}" - Spend: $${merged.spend}, CTR: ${(merged.ctr * 100).toFixed(2)}%`);

            return merged;
          });
        }
      }
    } catch (metaError) {
      console.warn('⚠️  Failed to fetch Meta data, using database campaigns:', metaError);
    }

    // Keep campaigns with any meaningful signal instead of only spend
    const campaignsWithSignals = activeCampaigns.filter((c: any) => {
      const spend = Number(c.spend) || 0;
      const impressions = Number(c.impressions) || 0;
      const clicks = Number(c.clicks) || 0;
      return spend > 0 || impressions > 0 || clicks > 0;
    });

    const campaignsForSignal = campaignsWithSignals.length > 0 ? campaignsWithSignals : activeCampaigns;

    console.log(`✅ [AI] Filtered to ${campaignsForSignal.length} campaigns with signals from ${activeCampaigns.length} total`);

    if (!campaignsForSignal.length) {
      console.warn('⚠️  [AI] No campaigns with spend found for performance review, returning guidance');
      return res.json({
        success: true,
        data: {
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
            'Once campaigns are running with data, you\'ll get detailed performance recommendations',
          ],
          isPlaceholder: true,
          message: 'No campaigns available for performance analysis. Launch campaigns to enable detailed insights.',
        },
      });
    }

    // Generate real performance review — also fetch ads per campaign
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

            // Flatten all ads across ad sets with normalised metrics
            const ads = await Promise.all(
              (adSets || []).map(async (adSet: any) => {
                const adSetMetaId = adSet.id;
                if (!adSetMetaId) return [];
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
                    conversions: adInsights?.conversions ? Number(adInsights.conversions) : 0,
                  };
                });
              })
            );

            return { ...campaign, ads: ads.flat() };
          }
        } catch (adError) {
          console.warn(`⚠️ [AI] Failed to fetch ads for campaign ${campaignMetaId}:`, adError);
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

      return res.json({ success: true, data: result });
    } catch (err) {
      console.warn('⚠️ [AI] generatePerformanceReview failed, building rule-based response:', err instanceof Error ? err.message : err);

      // Build a rule-based fallback from real campaign data instead of "unavailable" message
      const totalSpend = campaignsForReview.reduce((s: number, c: any) => s + (Number(c.spend) || 0), 0);
      const avgCTR = campaignsForReview.length
        ? campaignsForReview.reduce((s: number, c: any) => s + (Number(c.ctr) || 0), 0) / campaignsForReview.length
        : 0;
      const totalConversions = campaignsForReview.reduce((s: number, c: any) => s + (Number(c.conversions) || 0), 0);

      const fallback = {
        overallSummary: `Account has ${campaignsForReview.length} active campaign(s) with total spend of $${totalSpend.toFixed(2)}, average CTR of ${(avgCTR * 100).toFixed(2)}%, and ${totalConversions} total conversions over the last 30 days.`,
        campaigns: campaignsForReview.map((c: any) => {
          const ctr = Number(c.ctr) || 0;
          const roas = Number(c.roas) || 0;
          const spend = Number(c.spend) || 0;
          // CTR is percentage float (e.g. 2.34 = 2.34%)
          const status = roas >= 2 && ctr >= 1 ? 'good' : roas >= 1 || ctr >= 0.5 ? 'average' : 'poor';
          return {
            campaignId: c.id || c.metaCampaignId || '',
            campaignName: c.name || 'Unknown Campaign',
            status,
            spend,
            ctr,
            roas,
            conversions: Number(c.conversions) || 0,
            insights: ctr < 1
              ? [`CTR of ${ctr.toFixed(2)}% is below the 1% benchmark — consider refreshing creatives.`]
              : [`CTR of ${ctr.toFixed(2)}% is on track.`],
            recommendations: spend > 0 && roas < 1
              ? ['ROAS is below 1x — pause low-performing ad sets and reallocate budget.']
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
          input: { campaignData: campaignsForReview, metrics: { campaignCount: campaignsForReview.length, generatedAt: new Date().toISOString() } },
          output: {
            summary: fallback.overallSummary,
            insights: fallback.campaigns.flatMap((c: any) => c.insights),
            recommendations: fallback.campaigns.flatMap((c: any) => c.recommendations),
            rawResponse: JSON.stringify(fallback),
          },
          result: fallback,
          status: 'failed',
          error: err instanceof Error ? err.message : 'AI provider unavailable',
        });
      } catch (dbErr) {
        console.warn('⚠️ [AI] Failed to save insight to DB:', dbErr);
      }

      return res.json({ success: true, data: fallback });
    }
    } catch (outerErr) {
      console.error('❌ [AI] Outer error in performance review:', outerErr);
      // Even in outer error, try to return something useful
      return res.json({
        success: true,
        data: {
          overallSummary: 'Could not load campaign data. Please check your Meta Ads connection and try again.',
          campaigns: [],
        },
      });
    }
  })
);

// ── Creative Analysis ─────────────────────────────────────────
router.post(
  '/analyze-creatives',
  [
    body('adAccountId').notEmpty(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {

    if (!req.user?._id) throw new AppError('User not authenticated', 401);

    const userId = new mongoose.Types.ObjectId(req.user._id);
    const { adAccountId } = req.body;

    console.log('🧠 [AI] Analyzing creatives for:', { adAccountId });

    const ads = await Ad.find({ userId, adAccountId }).limit(30);

    // ✅ NO THROW on empty ads - return fallback insights
    if (!ads.length) {
      console.warn('⚠️  [AI] No ads found, returning fallback insights');
      return res.json({
        success: true,
        data: {
          analysis: 'No ads available for creative analysis',
          insights: [
            'You haven\'t created any ads yet. Start by creating ad creatives to receive AI-powered performance analysis.',
            'Upload or create multiple creative variations (different headlines, images, copy) to test what resonates with your audience.',
            'At least 3-5 different creatives are recommended for effective A/B testing and performance comparison.',
          ],
          recommendations: [
            'Create your first ad creative (headline, body copy, and visual)',
            'Launch ads with different variations to test performance',
            'Run each creative for at least 3-5 days before making changes',
            'Once you have running ads, we will analyze performance, fatigue, and optimization opportunities',
            'Next step: Create multiple ad variations and come back for AI analysis',
          ],
          creative_count: 0,
          isPlaceholder: true,
          message: 'No ads available for analysis. Create ads to enable creative performance analysis.',
        },
      });
    }

    const result = await aiService.analyzeCreativePerformance(ads as any);

    res.json({ success: true, data: result });
  })
);

// ── Budget Optimization ───────────────────────────────────────
router.post(
  '/optimize-budget',
  [
    body('adAccountId').notEmpty(),
    body('totalBudget').isFloat({ min: 1 }),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {

    if (!req.user?._id) throw new AppError('User not authenticated', 401);

    const userId = new mongoose.Types.ObjectId(req.user._id);
    const { adAccountId, totalBudget } = req.body;

    console.log('🧠 [AI] Optimizing budget for:', { adAccountId, totalBudget });

    const campaigns = await Campaign.find({
      userId,
      adAccountId,
      status: 'ACTIVE',
    });

    // ✅ NO THROW on empty campaigns - return fallback optimization
    if (!campaigns.length) {
      console.warn('⚠️  [AI] No active campaigns found, returning fallback budget allocation');
      return res.json({
        success: true,
        data: {
          current_allocation: [],
          optimized_allocation: [
            {
              recommendation: 'Launch your first campaign',
              suggested_budget: totalBudget,
              expected_roi: 'Pending (need campaign data)',
            },
          ],
          expected_roi_uplift: 0,
          key_recommendations: [
            'No active campaigns found. Start by creating campaigns to get budget optimization recommendations.',
            'Create at least 2-3 campaigns with different targeting strategies to enable budget optimization analysis.',
            'Run campaigns for 7+ days to gather performance data for AI analysis.',
            'Once campaigns are running, AI will recommend optimal budget allocation across them',
            'Typically, budget should be concentrated in campaigns with highest ROAS and CTR',
          ],
          estimated_monthly_impact: 'Pending',
          isPlaceholder: true,
          message: 'No campaigns available for budget optimization. Launch campaigns to enable analysis.',
        },
      });
    }

    const result = await aiService.optimizeBudgetAllocation(
      campaigns as any,
      totalBudget
    );

    res.json({ success: true, data: result });
  })
);

// ── Insight History ───────────────────────────────────────────
router.get(
  '/history',
  [query('limit').optional().isInt({ min: 1, max: 100 }), validateRequest],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {

    if (!req.user?._id) throw new AppError('User not authenticated', 401);

    const userId = new mongoose.Types.ObjectId(req.user._id);
    const limit = Number(req.query.limit || 20);

    const insights = await AIInsight.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      data: {
        insights: insights.map(normaliseInsightHistoryItem),
        total: insights.length,
      },
    });
  })
);

// ── Improvement Suggestions ───────────────────────────────────
router.post(
  '/improvements',
  [
    body('adAccountId').optional().isString(),
    validateRequest,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?._id) throw new AppError('User not authenticated', 401);

    const userId = new mongoose.Types.ObjectId(req.user._id);
    const { adAccountId, campaignId, adsetId, metrics } = req.body;

    console.log('🧠 [AI] Generating improvement suggestions:', { adAccountId, campaignId, adsetId });

    try {
      // Build context from provided metrics or fetch from DB
      let contextMetrics = metrics || {};
      let contextName = 'your campaigns';

      if (adsetId) {
        const adset = await (require('../models/AdSet').AdSet as any).findOne({ userId, metaAdSetId: adsetId }).lean().catch(() => null);
        if (adset) contextName = adset.name;
      } else if (campaignId) {
        const campaign = await Campaign.findOne({ userId, $or: [{ metaCampaignId: campaignId }, { _id: campaignId.length === 24 ? campaignId : undefined }] }).lean().catch(() => null);
        if (campaign) contextName = (campaign as any).name;
      }

      const spend = Number(contextMetrics.spend || 0);
      const ctr = Number(contextMetrics.ctr || 0);
      const conversions = Number(contextMetrics.conversions || 0);
      const roas = Number(contextMetrics.roas || 0);
      const cpa = Number(contextMetrics.cpa || 0);

      // Rule-based suggestions with AI enrichment if available
      const suggestions: string[] = [];

      if (ctr < 1) suggestions.push('Your CTR is below 1% — try refreshing your ad creative with a stronger headline or eye-catching visual.');
      else if (ctr < 2) suggestions.push('CTR is moderate. A/B test 2–3 new headline variants to push it above 2%.');
      else suggestions.push('CTR is healthy. Focus on improving post-click conversion rate.');

      if (conversions === 0 && spend > 0) suggestions.push('No conversions detected. Verify your conversion pixel is firing correctly.');
      else if (cpa > 50) suggestions.push(`Cost per acquisition (₹${cpa.toFixed(0)}) is high. Consider narrowing audience targeting or pausing low-CTR ad sets.`);
      else if (conversions > 0) suggestions.push('Conversions are happening. Scale the best-performing ad sets by 20% budget increase.');

      if (roas > 0 && roas < 1) suggestions.push('ROAS is below 1x — you are spending more than you earn. Pause underperforming ads immediately.');
      else if (roas >= 3) suggestions.push('Excellent ROAS! This campaign qualifies for budget scaling. Increase daily budget by 30–50%.');

      if (spend > 0 && spend < 10) suggestions.push('Daily spend is very low. Increase budget to at least ₹500/day to exit the Meta learning phase.');

      suggestions.push('Use Lookalike Audiences based on your existing converters to reach high-intent new users.');
      suggestions.push('Add video creative — video ads typically achieve 20–30% lower CPM than static images.');

      // Try GPT enrichment
      try {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (openaiKey) {
          const { OpenAI } = require('openai');
          const openai = new OpenAI({ apiKey: openaiKey });

          const prompt = `You are a Meta Ads performance expert. Given these ad metrics for "${contextName}":
- Spend: $${spend.toFixed(2)}
- CTR: ${ctr.toFixed(2)}%
- Conversions: ${conversions}
- ROAS: ${roas.toFixed(2)}x
- CPA: $${cpa.toFixed(2)}

Provide exactly 3 specific, actionable improvement suggestions. Each suggestion should be 1–2 sentences. Return as JSON array of strings: ["suggestion1","suggestion2","suggestion3"]`;

          const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 300,
          });

          const rawText = completion.choices[0]?.message?.content || '[]';
          const aiSuggestions = JSON.parse(rawText.match(/\[[\s\S]*\]/)?.[0] || '[]');
          if (Array.isArray(aiSuggestions) && aiSuggestions.length) {
            return res.json({ success: true, data: { suggestions: aiSuggestions, source: 'ai', contextName } });
          }
        }
      } catch (aiErr) {
        console.warn('⚠️ [AI Improvements] GPT call failed, using rule-based suggestions:', aiErr);
      }

      return res.json({ success: true, data: { suggestions: suggestions.slice(0, 5), source: 'rules', contextName } });
    } catch (err) {
      console.error('❌ [AI Improvements] Error:', err);
      return res.json({
        success: true,
        data: {
          suggestions: [
            'Refresh your ad creatives every 2–3 weeks to prevent audience fatigue.',
            'Test at least 3 ad variations per ad set for reliable performance data.',
            'Use retargeting audiences to re-engage website visitors and cart abandoners.',
            'Ensure your landing page load time is under 3 seconds to maximize conversions.',
            'Schedule ads during peak hours (evenings and weekends) for your target audience.',
          ],
          source: 'fallback',
          contextName: 'your campaigns',
        },
      });
    }
  })
);

export default router;
