import OpenAI from 'openai';
import { config, logger } from '../config';
import { AIInsight } from '../models/AIInsight';
import { Campaign } from '../models/Campaign';
import mongoose from 'mongoose';

interface AudienceDefinition {
  ageRange?: { min: number; max: number };
  locations?: string[];
  interests?: string[];
  painPoints?: string[];
  description?: string;
}

interface AIAnalysisOutput {
  alignment_score: number;
  gaps: string[];
  recommendations: string[];
}

interface AdReviewItem {
  adId: string;
  adName: string;
  status: 'good' | 'average' | 'poor';
  spend: number;
  ctr: number;
  conversions: number;
  insights: string[];
  recommendations: string[];
}

interface CampaignReviewItem {
  campaignId: string;
  campaignName: string;
  status: 'good' | 'average' | 'poor';
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
  conversions: number;
  performanceScore: number;
  confidence: 'high' | 'medium' | 'low';
  insights: string[];
  recommendations: string[];
  ads: AdReviewItem[];
}

interface PerformanceReviewOutput {
  overallSummary: string;
  campaigns: CampaignReviewItem[];
  // legacy fields kept for backward-compat
  overall_assessment?: string;
  top_performing_campaigns?: string[];
  underperforming_campaigns?: string[];
  budget_reallocation?: string[];
  quick_wins?: string[];
  strategic_changes?: string[];
}

export class AIService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }

  // ── System Prompt ─────────────────────────────────────────────────────────
  private readonly SYSTEM_PROMPT = `You are an elite digital marketing strategist specializing in Meta Ads with 15+ years of experience managing $100M+ in ad spend.

Your analysis is always:
- Data-driven and specific (cite actual numbers)
- Actionable (concrete next steps, not vague advice)
- Prioritized by revenue impact
- Honest (if performance is poor, say so clearly)

You MUST respond ONLY with valid JSON. No preamble, no explanations outside the JSON structure. No markdown code blocks.`;

  // ── Audience Analysis ─────────────────────────────────────────────────────
  async analyzeAudienceAlignment(
    userId: mongoose.Types.ObjectId,
    audienceDefinition: AudienceDefinition,
    campaigns: Record<string, unknown>[],
    adAccountId: string
  ): Promise<AIAnalysisOutput> {
    const startTime = Date.now();

    // Create insight record
    const insight = await AIInsight.create({
      userId,
      adAccountId,
      type: 'audience_analysis',
      audienceDefinition,
      input: {
        campaignData: campaigns,
        metrics: campaigns.map((c: any) => c.metrics),
        targeting: campaigns.map((c: any) => ({
          campaignName: c.name,
          targeting: c.targeting,
        })),
      },
      status: 'processing',
    });

    try {
      const prompt = `
Analyze the alignment between the target audience definition and current campaign targeting/performance.

TARGET AUDIENCE:
${JSON.stringify(audienceDefinition, null, 2)}

CAMPAIGNS DATA (${campaigns.length} campaigns):
${JSON.stringify(
  campaigns.map((c: any) => ({
    name: c.name,
    status: c.status,
    objective: c.objective,
    metrics: c.metrics,
    healthScore: c.healthScore,
  })),
  null,
  2
)}

Return this exact JSON structure:
{
  "alignment_score": <number 1-10>,
  "gaps": [<specific gap identified between audience definition and actual targeting/performance>],
  "recommendations": [<specific actionable recommendation with expected impact>]
}

Provide 3-6 gaps and 4-8 recommendations. Be specific with numbers and percentages.`;

      const response = await this.client.chat.completions.create({
        model: config.openai.model,
        messages: [
          { role: 'system', content: this.SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content || '{}';
      const parsed: AIAnalysisOutput = JSON.parse(content);

      // Validate output
      const output: AIAnalysisOutput = {
        alignment_score: Math.min(10, Math.max(1, Number(parsed.alignment_score) || 5)),
        gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      };

      await AIInsight.findByIdAndUpdate(insight._id, {
        output: {
          alignmentScore: output.alignment_score,
          gaps: output.gaps,
          recommendations: output.recommendations,
          rawResponse: content,
        },
        tokensUsed: response.usage?.total_tokens,
        processingTimeMs: Date.now() - startTime,
        status: 'completed',
      });

      return output;
    } catch (error) {
      logger.error('❌ [AIService] OpenAI call failed for audience analysis:', {
        error: error instanceof Error ? error.message : error,
      });
      await AIInsight.findByIdAndUpdate(insight._id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Return rule-based fallback so the endpoint never 500s
      return {
        alignment_score: 5,
        gaps: [
          'AI analysis temporarily unavailable — showing automated assessment',
          campaigns.length === 0
            ? 'No active campaigns found to compare against your audience definition'
            : `${campaigns.length} campaign(s) found but could not be analyzed in depth`,
        ],
        recommendations: [
          'Ensure your campaigns target the age range and locations defined in your audience',
          'Review interest targeting to match your stated audience pain points',
          'Run campaigns for at least 7 days to collect statistically meaningful data',
          'Try again shortly for a full GPT-powered analysis',
        ],
      };
    }
  }

  // ── Performance Review ────────────────────────────────────────────────────
  async generatePerformanceReview(
    userId: mongoose.Types.ObjectId,
    adAccountId: string,
    campaigns: any[] = []
  ): Promise<PerformanceReviewOutput> {
    let campaignsData = campaigns;
    if (!campaignsData.length) {
      campaignsData = await Campaign.find({ userId, adAccountId })
        .select('name status metrics healthScore anomalies suggestions budget')
        .lean();
    }

    if (!campaignsData.length) {
      return {
        overallSummary: 'No active campaigns found. Create and run campaigns to get performance analysis.',
        campaigns: [],
        overall_assessment: 'No active campaigns found. Create and run campaigns to get performance analysis.',
        top_performing_campaigns: [],
        underperforming_campaigns: [],
        budget_reallocation: [],
        quick_wins: ['Launch your first campaign', 'Set a budget of $10-20 daily', 'Run for 7+ days'],
        strategic_changes: ['Define clear KPIs', 'A/B test audiences', 'Implement tracking'],
      };
    }

    const normalizedCampaigns = campaignsData.map((campaign) => this._normalizeCampaignForReview(campaign));
    const totalSpend = normalizedCampaigns.reduce((sum, c) => sum + c.spend, 0);
    const avgCTR = normalizedCampaigns.reduce((sum, c) => sum + c.ctr, 0) / normalizedCampaigns.length;
    const avgROAS = normalizedCampaigns.reduce((sum, c) => sum + c.roas, 0) / normalizedCampaigns.length;
    const totalConversions = normalizedCampaigns.reduce((sum, c) => sum + c.conversions, 0);

    try {
      const campaignReviews: CampaignReviewItem[] = [];
      for (const campaign of normalizedCampaigns) {
        campaignReviews.push(await this._generateCampaignSpecificReview(campaign));
      }

      const ranked = [...campaignReviews].sort((a, b) => b.performanceScore - a.performanceScore);
      const topPerformers = ranked.filter((campaign) => campaign.status === 'good').slice(0, 3);
      const underperformers = [...ranked].reverse().filter((campaign) => campaign.status === 'poor').slice(0, 3);

      const overallSummary = this._buildOverallSummary(campaignReviews, {
        totalSpend,
        avgCTR,
        avgROAS,
        totalConversions,
      });

      return {
        overallSummary,
        campaigns: campaignReviews,
        overall_assessment: overallSummary,
        top_performing_campaigns: topPerformers.map((campaign) => `${campaign.campaignName}: score ${campaign.performanceScore}/100, ROAS ${campaign.roas.toFixed(2)}x`),
        underperforming_campaigns: underperformers.map((campaign) => `${campaign.campaignName}: score ${campaign.performanceScore}/100, CTR ${(campaign.ctr * 100).toFixed(2)}%`),
        budget_reallocation: topPerformers.length > 0
          ? topPerformers.map((campaign) => `Consider moving 10-20% more budget toward ${campaign.campaignName} if delivery remains stable.`)
          : ['No strong scaling candidate yet — improve conversion efficiency before increasing spend.'],
        quick_wins: this._uniqueStrings(campaignReviews.flatMap((campaign) => campaign.recommendations)).slice(0, 4),
        strategic_changes: this._buildStrategicChanges(campaignReviews),
      };
    } catch (aiError: any) {
      logger.error('❌ [AIService] OpenAI call failed for performance review:', {
        error: aiError?.message || aiError,
        code: aiError?.code,
        status: aiError?.status,
      });

      return this._buildRuleBasedReview(normalizedCampaigns, { totalSpend, avgCTR, avgROAS, totalConversions });
    }
  }

  // ── Rule-based fallback review (no OpenAI needed) ────────────────────────
  private _buildRuleBasedReview(
    campaigns: ReturnType<AIService['_normalizeCampaignForReview']>[],
    metrics: { totalSpend: number; avgCTR: number; avgROAS: number; totalConversions: number }
  ): PerformanceReviewOutput {
    const { totalSpend, avgCTR, avgROAS, totalConversions } = metrics;
    // campaigns are already normalized — do NOT re-normalize
    const campaignItems = campaigns.map((campaign) => this._buildRuleBasedCampaignReview(campaign));
    const overallSummary = this._buildOverallSummary(campaignItems, {
      totalSpend,
      avgCTR,
      avgROAS,
      totalConversions,
    });

    return {
      overallSummary,
      campaigns: campaignItems,
      overall_assessment: overallSummary,
      top_performing_campaigns: campaignItems.filter((campaign) => campaign.status === 'good').map((campaign) => `${campaign.campaignName}: score ${campaign.performanceScore}/100`).slice(0, 3),
      underperforming_campaigns: campaignItems.filter((campaign) => campaign.status === 'poor').map((campaign) => `${campaign.campaignName}: fix ${campaign.recommendations[0]}`).slice(0, 3),
      budget_reallocation: campaignItems.filter((campaign) => campaign.status === 'good').map((campaign) => `Scale ${campaign.campaignName} gradually while watching CPA and frequency.`).slice(0, 3),
      quick_wins: this._uniqueStrings(campaignItems.flatMap((campaign) => campaign.recommendations)).slice(0, 4),
      strategic_changes: this._buildStrategicChanges(campaignItems),
    };
  }

  private _normalizeCampaignForReview(campaign: any) {
    const metrics = campaign?.metrics || {};
    // Use != null so that a genuine 0 is preserved, not skipped by ??
    const pick = (root: any, nested: any) => root != null ? Number(root) : Number(nested ?? 0);
    return {
      campaignId: campaign?.id || campaign?._id?.toString?.() || campaign?.metaCampaignId || '',
      campaignName: campaign?.name || 'Unnamed Campaign',
      status: campaign?.status || 'UNKNOWN',
      objective: campaign?.objective || '',
      spend:       pick(campaign?.spend,       metrics.spend),
      impressions: pick(campaign?.impressions, metrics.impressions),
      clicks:      pick(campaign?.clicks,      metrics.clicks),
      ctr:         pick(campaign?.ctr,         metrics.ctr),
      conversions: pick(campaign?.conversions, metrics.conversions),
      cpc:         pick(campaign?.cpc,         metrics.cpc),
      cpm:         pick(campaign?.cpm,         metrics.cpm),
      roas:        pick(campaign?.roas,        metrics.roas),
      ads: Array.isArray(campaign?.ads)
        ? campaign.ads.map((ad: any) => ({
            id: ad?.id || ad?._id?.toString?.() || '',
            name: ad?.name || 'Unnamed Ad',
            spend:       pick(ad?.spend,       ad?.metrics?.spend),
            ctr:         pick(ad?.ctr,         ad?.metrics?.ctr),
            conversions: pick(ad?.conversions, ad?.metrics?.conversions),
            clicks:      pick(ad?.clicks,      ad?.metrics?.clicks),
            impressions: pick(ad?.impressions, ad?.metrics?.impressions),
          }))
        : [],
    };
  }

  private _buildRuleBasedCampaignReview(campaign: ReturnType<AIService['_normalizeCampaignForReview']>): CampaignReviewItem {
    const status = this._deriveCampaignStatus(campaign);
    const performanceScore = this._deriveCampaignScore(campaign);
    const confidence = this._deriveConfidence(campaign);
    const insights: string[] = [];
    const recommendations: string[] = [];

    // CTR is stored as percentage float (e.g. 2.34 = 2.34%), thresholds use percentage scale
    if (campaign.ctr < 1) {
      insights.push(`CTR is ${campaign.ctr.toFixed(2)}%, which points to weak creative resonance or loose targeting.`);
      recommendations.push('Refresh creative hooks, tighten audience targeting, and retest headlines to lift CTR above 1%.');
    }

    if (campaign.ctr >= 2 && campaign.conversions <= 1 && campaign.clicks >= 20) {
      insights.push(`CTR is strong at ${campaign.ctr.toFixed(2)}%, but only ${campaign.conversions} conversion(s) came from ${campaign.clicks} click(s).`);
      recommendations.push('Audit the landing page, offer clarity, and conversion tracking because the ad is earning clicks but not closing.');
    }

    if (campaign.spend >= 500 && campaign.conversions === 0) {
      insights.push(`Spend reached $${campaign.spend.toFixed(2)} with zero conversions, making this a high-cost underperformer.`);
      recommendations.push('Pause or sharply reduce budget until tracking, landing page, and audience fit are verified.');
    }

    if (campaign.cpc >= 20) {
      insights.push(`CPC is elevated at $${campaign.cpc.toFixed(2)}, suggesting inefficient traffic acquisition.`);
      recommendations.push('Refine audience segments and test lower-friction creatives to bring CPC down.');
    }

    if (campaign.roas >= 2 && campaign.conversions > 0) {
      insights.push(`ROAS is ${campaign.roas.toFixed(2)}x with ${campaign.conversions} conversion(s), which is a scaling signal.`);
      recommendations.push('Increase budget in controlled steps and protect the current winning audience and creative combination.');
    }

    if (campaign.impressions >= 5000 && campaign.clicks < 25) {
      insights.push(`${campaign.impressions.toLocaleString()} impressions produced only ${campaign.clicks} clicks, so attention is weak at the top of funnel.`);
      recommendations.push('Test more disruptive visuals and stronger primary text to improve early engagement.');
    }

    if (insights.length === 0) {
      insights.push(`Spend is $${campaign.spend.toFixed(2)}, CTR ${campaign.ctr.toFixed(2)}%, ROAS ${campaign.roas.toFixed(2)}x, and conversions ${campaign.conversions}.`);
    }
    if (recommendations.length === 0) {
      recommendations.push('Maintain current structure and monitor CTR, CPA, and ROAS for the next few days before making changes.');
    }

    return {
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      status,
      spend: campaign.spend,
      impressions: campaign.impressions,
      clicks: campaign.clicks,
      ctr: campaign.ctr,
      cpc: campaign.cpc,
      cpm: campaign.cpm,
      roas: campaign.roas,
      conversions: campaign.conversions,
      performanceScore,
      confidence,
      insights: this._uniqueStrings(insights).slice(0, 4),
      recommendations: this._uniqueStrings(recommendations).slice(0, 4),
      ads: campaign.ads.map((ad: any) => this._buildRuleBasedAdReview(ad)),
    };
  }

  private _buildRuleBasedAdReview(ad: any): AdReviewItem {
    const spend = Number(ad?.spend || 0);
    const ctr = Number(ad?.ctr || 0);
    const conversions = Number(ad?.conversions || 0);
    const insights: string[] = [];
    const recommendations: string[] = [];
    let status: 'good' | 'average' | 'poor' = 'average';

    // CTR is stored as percentage float (e.g. 2.34 = 2.34%)
    if (ctr < 1) {
      status = spend > 50 ? 'poor' : 'average';
      insights.push(`Low CTR of ${ctr.toFixed(2)}% suggests the creative is not earning enough clicks.`);
      recommendations.push('Swap the headline, first-frame visual, or CTA to improve thumb-stop rate.');
    }
    if (ctr >= 2) {
      insights.push(`CTR is ${ctr.toFixed(2)}%, which is a healthy engagement signal.`);
    }
    if (spend > 100 && conversions === 0) {
      status = 'poor';
      insights.push(`This ad spent $${spend.toFixed(2)} without any conversions.`);
      recommendations.push('Pause this ad and compare its landing page path and audience fit against your winners.');
    }
    if (conversions > 0 && ctr >= 2) {
      status = 'good';
      insights.push(`Produced ${conversions} conversion(s) with strong engagement.`);
      recommendations.push('Protect this ad in the mix and consider giving it a larger share of spend.');
    }
    if (insights.length === 0) {
      insights.push(`Spend is $${spend.toFixed(2)}, CTR ${ctr.toFixed(2)}%, and conversions ${conversions}.`);
    }
    if (recommendations.length === 0) {
      recommendations.push('Keep monitoring this ad for another 3-5 days before making a larger change.');
    }

    return {
      adId: ad?.id || '',
      adName: ad?.name || 'Unnamed Ad',
      status,
      spend,
      ctr,
      conversions,
      insights: this._uniqueStrings(insights).slice(0, 3),
      recommendations: this._uniqueStrings(recommendations).slice(0, 3),
    };
  }

  private async _generateCampaignSpecificReview(
    campaign: ReturnType<AIService['_normalizeCampaignForReview']>
  ): Promise<CampaignReviewItem> {
    const baseReview = this._buildRuleBasedCampaignReview(campaign);
    const prompt = `
You are a Meta Ads expert.

Analyze this campaign ONLY. Do not give generic advice. Your output must be different if the numbers are different.

Campaign:
Name: ${campaign.campaignName}
Spend: ${campaign.spend.toFixed(2)}
Impressions: ${Math.round(campaign.impressions)}
Clicks: ${Math.round(campaign.clicks)}
CTR: ${campaign.ctr.toFixed(2)}%
Conversions: ${Math.round(campaign.conversions)}
CPC: ${campaign.cpc.toFixed(2)}
CPM: ${campaign.cpm.toFixed(2)}
ROAS: ${campaign.roas.toFixed(2)}

Rules:
- If CTR < 1%, call out weak creatives or targeting mismatch.
- If CTR > 2% but conversions are low, call out landing page or tracking issues.
- If spend is high and conversions are 0, mark it as a serious efficiency problem.
- Recommendations must reference the metrics above.

Return valid JSON only:
{
  "insights": ["...", "...", "..."],
  "recommendations": ["...", "...", "..."]
}`;

    try {
      const response = await this.client.chat.completions.create({
        model: config.openai.model,
        messages: [
          { role: 'system', content: this.SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content || '{}';
      const parsed = JSON.parse(content) as { insights?: string[]; recommendations?: string[] };
      return {
        ...baseReview,
        insights: this._uniqueStrings([...(baseReview.insights || []), ...((Array.isArray(parsed.insights) ? parsed.insights : []))]).slice(0, 4),
        recommendations: this._uniqueStrings([...(baseReview.recommendations || []), ...((Array.isArray(parsed.recommendations) ? parsed.recommendations : []))]).slice(0, 4),
      };
    } catch (error) {
      logger.warn('⚠️ [AIService] Campaign-specific review fell back to rules:', {
        campaignName: campaign.campaignName,
        error: error instanceof Error ? error.message : error,
      });
      return baseReview;
    }
  }

  private _deriveCampaignStatus(campaign: ReturnType<AIService['_normalizeCampaignForReview']>): 'good' | 'average' | 'poor' {
    // CTR is percentage float (e.g. 2.34 = 2.34%)
    if ((campaign.spend >= 500 && campaign.conversions === 0) || (campaign.roas < 1 && campaign.spend > 0) || (campaign.ctr < 0.75 && campaign.impressions > 2000)) {
      return 'poor';
    }
    if (campaign.roas >= 2 || (campaign.ctr >= 2 && campaign.conversions > 0)) {
      return 'good';
    }
    return 'average';
  }

  private _deriveCampaignScore(campaign: ReturnType<AIService['_normalizeCampaignForReview']>): number {
    let score = 50;
    // ctr is percentage (e.g. 2.34%), scale contribution: up to +20 at ~2% CTR
    score += Math.min(20, campaign.ctr * 10);
    score += Math.max(-15, Math.min(25, (campaign.roas - 1) * 15));
    score += campaign.conversions > 0 ? Math.min(20, campaign.conversions * 2) : campaign.spend > 100 ? -12 : -4;
    if (campaign.spend >= 500 && campaign.conversions === 0) score -= 20;
    if (campaign.cpc >= 20) score -= 8;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private _deriveConfidence(campaign: ReturnType<AIService['_normalizeCampaignForReview']>): 'high' | 'medium' | 'low' {
    const signalPoints = [
      campaign.spend >= 250,
      campaign.impressions >= 5000,
      campaign.clicks >= 50,
      campaign.conversions >= 3,
    ].filter(Boolean).length;
    if (signalPoints >= 3) return 'high';
    if (signalPoints >= 2) return 'medium';
    return 'low';
  }

  private _buildOverallSummary(
    campaigns: CampaignReviewItem[],
    metrics: { totalSpend: number; avgCTR: number; avgROAS: number; totalConversions: number }
  ) {
    const goodCount = campaigns.filter((campaign) => campaign.status === 'good').length;
    const poorCount = campaigns.filter((campaign) => campaign.status === 'poor').length;
    const topCampaign = [...campaigns].sort((a, b) => b.performanceScore - a.performanceScore)[0];
    const weakestCampaign = [...campaigns].sort((a, b) => a.performanceScore - b.performanceScore)[0];

    let summary = `Reviewed ${campaigns.length} campaign(s) with total spend of $${metrics.totalSpend.toFixed(2)}, average CTR of ${metrics.avgCTR.toFixed(2)}%, average ROAS of ${metrics.avgROAS.toFixed(2)}x, and ${Math.round(metrics.totalConversions)} total conversion(s).`;
    if (topCampaign) {
      summary += ` Best performer: ${topCampaign.campaignName} at ${topCampaign.performanceScore}/100.`;
    }
    if (weakestCampaign && poorCount > 0) {
      summary += ` Main risk: ${weakestCampaign.campaignName} is draining efficiency and should be reviewed first.`;
    } else if (goodCount === campaigns.length) {
      summary += ' The account is broadly healthy with multiple scale candidates.';
    }
    return summary;
  }

  private _buildStrategicChanges(campaigns: CampaignReviewItem[]) {
    const changes: string[] = [];
    // CTR is percentage float (e.g. 2.34 = 2.34%)
    if (campaigns.some((campaign) => campaign.ctr < 1)) {
      changes.push('Refresh creative testing cadence weekly until low-CTR campaigns move above 1%.');
    }
    if (campaigns.some((campaign) => campaign.ctr >= 2 && campaign.conversions <= 1 && campaign.clicks >= 20)) {
      changes.push('Prioritize landing page and conversion tracking fixes because click intent is not turning into outcomes.');
    }
    if (campaigns.some((campaign) => campaign.roas >= 2)) {
      changes.push('Shift more budget toward campaigns already delivering 2x+ ROAS instead of spreading spend evenly.');
    }
    if (changes.length === 0) {
      changes.push('Keep iterating on creative and audience testing while monitoring CTR, CPC, and conversion volume together.');
    }
    return changes.slice(0, 4);
  }

  private _uniqueStrings(items: string[]) {
    return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
  }

  // ── Creative Analysis ─────────────────────────────────────────────────────
  async analyzeCreativePerformance(
    adData: Array<{
      name: string;
      creative: Record<string, unknown>;
      metrics: Record<string, unknown>;
      creativeFatigue: Record<string, unknown>;
    }>
  ): Promise<{
    top_creatives: string[];
    fatigued_creatives: string[];
    creative_improvements: string[];
    new_angle_suggestions: string[];
  }> {
    const prompt = `
Analyze these ad creatives and their performance data.

AD CREATIVES:
${JSON.stringify(adData, null, 2)}

Return this exact JSON:
{
  "top_creatives": ["<creative name: why it's performing well>"],
  "fatigued_creatives": ["<creative name: fatigue signals observed>"],
  "creative_improvements": ["<specific improvement for existing creatives>"],
  "new_angle_suggestions": ["<new creative angle or concept to test>"]
}`;

    const response = await this.client.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: this.SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  }

  // ── Budget Optimization ───────────────────────────────────────────────────
  async optimizeBudgetAllocation(
    campaigns: Array<{
      id: string;
      name: string;
      currentBudget: number;
      metrics: Record<string, unknown>;
      healthScore: number;
    }>,
    totalBudget: number
  ): Promise<{
    allocations: Array<{ campaignId: string; campaignName: string; recommendedBudget: number; changePercent: number; reason: string }>;
    expectedImpact: string;
    total_budget_check: number;
  }> {
    const prompt = `
Optimize budget allocation across these campaigns to maximize total ROAS.

TOTAL AVAILABLE BUDGET: $${totalBudget}/day

CAMPAIGNS:
${JSON.stringify(campaigns, null, 2)}

Redistribute the EXACT total budget of $${totalBudget} across campaigns.
Higher ROAS + higher health score = more budget.
Pause or reduce budget for campaigns with ROAS < 1.

Return this exact JSON:
{
  "allocations": [
    {
      "campaignId": "<id>",
      "campaignName": "<name>",
      "recommendedBudget": <daily budget in dollars>,
      "changePercent": <percent change from current>,
      "reason": "<why this allocation>"
    }
  ],
  "expectedImpact": "<expected overall account improvement>",
  "total_budget_check": <sum of all recommended budgets>
}`;

    const response = await this.client.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: this.SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  }
}

export const aiService = new AIService();
