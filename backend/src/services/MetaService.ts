import axios, { AxiosInstance } from 'axios';
import { config, logger } from '../config';
import { Campaign, ICampaign } from '../models/Campaign';
import { AdSet } from '../models/AdSet';
import { Ad } from '../models/Ad';
import { User } from '../models/User';
import crypto from 'crypto';

interface MetaApiResponse<T> {
  data: T;
  paging?: {
    cursors: { before: string; after: string };
    next?: string;
  };
}

interface MetaCampaignRaw {
  id: string;
  name: string;
  status: string;
  objective: string;
  buying_type: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  insights?: { data: MetaInsightRaw[] };
}

interface MetaInsightRaw {
  campaign_name?: string;
  campaign_id?: string;
  adset_name?: string;
  impressions: string;
  reach: string;
  clicks: string;
  spend: string;
  conversions?: Array<{ action_type: string; value: string }>;
  cpm: string;
  cpc: string;
  ctr: string;
  frequency: string;
  action_values?: Array<{ action_type: string; value: string }>;
  actions?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ value: string }>;
  date_start: string;
  date_stop: string;
}

export class MetaService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.meta.baseUrl,
      timeout: 30000,
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        const metaError = error.response?.data?.error;
        if (metaError) {
          logger.error('Meta API Error:', {
            code: metaError.code,
            message: metaError.message,
            type: metaError.type,
          });
        }
        throw error;
      }
    );
  }

  private buildInsightsDateParams(dateParams?: {
    preset?: string;
    since?: string;
    until?: string;
  }): Record<string, string> {
    if (dateParams?.since && dateParams?.until) {
      return {
        time_range: JSON.stringify({
          since: dateParams.since,
          until: dateParams.until,
        }),
      };
    }

    return {
      date_preset: dateParams?.preset || 'last_30d',
    };
  }

  private async fetchEntityInsights(
    entityId: string,
    accessToken: string,
    dateParams?: { preset?: string; since?: string; until?: string }
  ): Promise<MetaInsightRaw | null> {
    const response = await this.client.get<MetaApiResponse<MetaInsightRaw[]>>(
      `/${entityId}/insights`,
      {
        params: {
          access_token: accessToken,
          fields:
            'campaign_name,campaign_id,adset_name,impressions,reach,spend,cpc,ctr,actions,action_values,conversions,clicks,cpm,frequency,purchase_roas',
          limit: 1,
          ...this.buildInsightsDateParams(dateParams),
        },
      }
    );

    return response.data?.data?.[0] || null;
  }

  // ── OAuth ─────────────────────────────────────────────────────────────────
  getOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.meta.appId,
      redirect_uri: config.meta.redirectUri,
      scope: [
  'public_profile',
  'email',
  'ads_read',
  'ads_management',
  'business_management'
].join(','),
      state,
      response_type: 'code',
    });
    return `https://www.facebook.com/dialog/oauth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    expiresIn: number;
    userId: string;
  }> {
    const response = await this.client.get('/oauth/access_token', {
      params: {
        client_id: config.meta.appId,
        client_secret: config.meta.appSecret,
        redirect_uri: config.meta.redirectUri,
        code,
      },
    });

    const { access_token, expires_in } = response.data;

    // Get user ID
    const userResponse = await this.client.get('/me', {
      params: { access_token, fields: 'id,name' },
    });

    return {
      accessToken: access_token,
      expiresIn: expires_in || 5184000, // 60 days default
      userId: userResponse.data.id,
    };
  }

  async getLongLivedToken(shortLivedToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const response = await this.client.get('/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: config.meta.appId,
        client_secret: config.meta.appSecret,
        fb_exchange_token: shortLivedToken,
      },
    });
    return {
      accessToken: response.data.access_token,
      expiresIn: response.data.expires_in,
    };
  }

  // ── Ad Accounts ───────────────────────────────────────────────────────────
  async getAdAccounts(accessToken: string): Promise<Array<{
    id: string;
    name: string;
    currency: string;
    timezone: string;
    accountStatus: number;
  }>> {
    const response = await this.client.get<MetaApiResponse<unknown[]>>('/me/adaccounts', {
      params: {
        access_token: accessToken,
        fields: 'id,name,currency,timezone_name,account_status,amount_spent',
        limit: 25,
      },
    });
    return response.data.data.map((account: any) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      timezone: account.timezone_name,
      accountStatus: account.account_status,
    }));
  }

  // ── Campaigns - Direct Fetch (Real-Time) ─────────────────────────────────
  /**
   * Fetches basic campaign data directly from Meta Graph API
   * Used for real-time campaign list display without waiting for background sync
   */
  async getMetaCampaigns(
    accessToken: string,
    adAccountId: string,
    dateParams?: { preset?: string; since?: string; until?: string }
  ): Promise<Array<Record<string, any>>> {
    if (!accessToken?.trim()) {
      const err = new Error('Invalid or missing access token');
      (err as any).status = 401;
      throw err;
    }

    // Format account ID
    const formattedAccountId = adAccountId.startsWith('act_')
      ? adAccountId
      : `act_${adAccountId}`;

    try {
      logger.info(`📊 Fetching campaigns from Meta for ${formattedAccountId}`);
      logger.info(`📡 Meta API Call: GET https://graph.facebook.com/v19.0/${formattedAccountId}/campaigns`);

      const response = await this.client.get(
        `/${formattedAccountId}/campaigns`,
        {
          params: {
            access_token: accessToken,
            fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,buying_type',
            limit: 50,
          },
        }
      );

      logger.info(`📡 Meta API Response:`, {
        status: response.status,
        hasData: !!response.data?.data,
        dataLength: response.data?.data?.length || 0,
      });

      if (!response.data || !Array.isArray(response.data.data)) {
        logger.warn(`⚠️ Empty or malformed campaigns response from Meta`, {
          adAccountId: formattedAccountId,
          responseStatus: response.status,
          responseData: response.data,
        });
        return [];
      }

      const campaigns = response.data.data;
      logger.info(`✅ Successfully fetched ${campaigns.length} campaigns`, {
        adAccountId: formattedAccountId,
        campaignCount: campaigns.length,
      });

      const campaignsWithInsights = await Promise.all(
        campaigns.map(async (campaign: any) => {
          let insights: Record<string, any>[] = [];

          try {
            const insightDateParams: Record<string, any> = dateParams?.since && dateParams?.until
              ? { time_range: JSON.stringify({ since: dateParams.since, until: dateParams.until }) }
              : { date_preset: dateParams?.preset || 'last_30d' };
            const insightsResponse = await this.client.get(`/${campaign.id}/insights`, {
              params: {
                access_token: accessToken,
                fields: 'spend,ctr,clicks,impressions,cpc,cpm,reach,frequency,actions,action_values,conversions,purchase_roas',
                limit: 1,
                ...insightDateParams,
              },
            });

            insights = (insightsResponse.data?.data || []) as Record<string, any>[];
            logger.info('Insights:', {
              campaignId: campaign.id,
              campaignName: campaign.name,
              insights,
            });
          } catch (error: any) {
            logger.warn(`⚠️ Failed to fetch insights for campaign ${campaign.id}`, {
              error: error.message,
            });
          }

          return {
            id: campaign.id,
            name: campaign.name || 'Unnamed Campaign',
            status: campaign.status || 'UNKNOWN',
            objective: campaign.objective || 'UNKNOWN',
            daily_budget: campaign.daily_budget ? parseInt(campaign.daily_budget) / 100 : null,
            lifetime_budget: campaign.lifetime_budget
              ? parseInt(campaign.lifetime_budget) / 100
              : null,
            insights: { data: insights },
            start_time: campaign.start_time || null,
            stop_time: campaign.stop_time || null,
            buying_type: campaign.buying_type || null,
          };
        })
      );

      return campaignsWithInsights;
    } catch (error: any) {
      const metaError = error.response?.data?.error;
      const statusCode = error.response?.status;

      logger.error('❌ Failed to fetch campaigns from Meta', {
        errorType: metaError?.type || error.name,
        errorCode: metaError?.code,
        errorMessage: metaError?.message || error.message,
        httpStatus: statusCode,
        adAccountId: formattedAccountId,
        fullError: error.response?.data || error.message,
      });

      // Handle specific errors with proper status codes
      if (statusCode === 401 || metaError?.code === 190) {
        const err = new Error('Invalid OAuth token. Please reconnect to Meta.');
        (err as any).status = 401;
        throw err;
      }

      if (statusCode === 403 || metaError?.code === 200) {
        const err = new Error(
          'Missing permissions. Required: ads_read, ads_management'
        );
        (err as any).status = 403;
        throw err;
      }

      if (statusCode === 400) {
        const err = new Error(
          `Invalid request to Meta API: ${metaError?.message || error.message}`
        );
        (err as any).status = 400;
        throw err;
      }

      // For any other error, return 400 internally but log full details
      const err = new Error(
        `Failed to fetch campaigns: ${metaError?.message || error.message}`
      );
      (err as any).status = statusCode || 400;
      throw err;
    }
  }

  // ── Single Campaign + Insights (Real-Time) ──────────────────────────────
  /**
   * Fetches a single campaign with separate insights call
   * Insights are fetched separately as Meta doesn't always include them
   */
  async getSingleCampaignWithInsights(
    campaignId: string,
    accessToken: string,
    dateParams?: { preset?: string; since?: string; until?: string }
  ): Promise<{ campaign: Record<string, any>; insights: Record<string, any> | null }> {
    try {
      logger.info(`📊 Fetching single campaign with insights: ${campaignId}`);

      // ── Fetch Campaign Details ────────────────────────────────────────
      let campaign: Record<string, any> | null = null;
      try {
        const campaignRes = await this.client.get(`/${campaignId}`, {
          params: {
            fields:
              'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,buying_type',
            access_token: accessToken,
          },
        });
        campaign = campaignRes.data as Record<string, any>;
        
        if (campaign) {
          logger.info(`✅ Campaign fetched: ${campaign.name || campaignId}`);
        }
      } catch (err: any) {
        logger.error(`❌ Failed to fetch campaign ${campaignId}`, {
          errorMessage: err.message,
          errorCode: err.response?.data?.error?.code,
        });
        throw err;
      }

      // ── Fetch Insights Separately ─────────────────────────────────────
      let insights: Record<string, any> | null = null;
      try {
        const insightsRes = await this.client.get(`/${campaignId}/insights`, {
          params: {
            fields: 'spend,ctr,cpc,impressions,clicks,reach,conversions,frequency,cpm,actions,action_values,purchase_roas',
            access_token: accessToken,
            ...this.buildInsightsDateParams(dateParams),
          },
        });

        // Extract first insight record (most recent)
        const firstInsight = insightsRes.data?.data?.[0];
        insights = firstInsight ? (firstInsight as Record<string, any>) : null;
        
        logger.info(`✅ Insights fetched for ${campaignId}`, {
          hasInsights: !!insights,
          spend: insights?.spend || 'N/A',
        });
      } catch (err: any) {
        logger.warn(`⚠️ Failed to fetch insights for ${campaignId}`, {
          errorMessage: err.message,
        });
        // Insights are optional, don't fail the whole request
        insights = null;
      }

      if (!campaign) {
        const err = new Error(`Campaign ${campaignId} not found`);
        (err as any).status = 404;
        throw err;
      }

      return { campaign, insights };
    } catch (error: any) {
      logger.error(`❌ Error fetching campaign with insights: ${campaignId}`, {
        error: error.message,
      });
      throw error;
    }
  }

  // ── Campaigns - With Insights (for Sync) ────────────────────────────────
  async getCampaigns(
    accessToken: string,
    adAccountId: string,
    dateRange: { since: string; until: string }
  ): Promise<MetaCampaignRaw[]> {
    const fields = [
      'id', 'name', 'status', 'objective', 'buying_type',
      'daily_budget', 'lifetime_budget', 'start_time', 'stop_time',
      `insights.date_preset(last_30d){impressions,reach,clicks,spend,cpm,cpc,ctr,frequency,actions,action_values,conversions,purchase_roas}`,
    ].join(',');

    const allCampaigns: MetaCampaignRaw[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.client.get<MetaApiResponse<MetaCampaignRaw[]>>(
        `/${adAccountId}/campaigns`,
        {
          params: {
            access_token: accessToken,
            fields,
            limit: 100,
            after: cursor,
            filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]),
          },
        }
      );
      allCampaigns.push(...response.data.data);
      cursor = response.data.paging?.cursors?.after;
      if (!response.data.paging?.next) break;
    } while (cursor);

    return allCampaigns;
  }

  // ── Ad Sets ───────────────────────────────────────────────────────────────
  async getAdSets(
    accessToken: string,
    adAccountId: string
  ): Promise<unknown[]> {
    const fields = [
      'id', 'name', 'status', 'campaign_id',
      'targeting', 'daily_budget', 'lifetime_budget',
      'bid_amount', 'bid_strategy', 'optimization_goal',
      'billing_event', 'start_time', 'end_time',
      'insights.date_preset(last_30d){impressions,reach,clicks,spend,cpm,cpc,ctr,frequency,actions,action_values}',
    ].join(',');

    const response = await this.client.get<MetaApiResponse<unknown[]>>(
      `/${adAccountId}/adsets`,
      {
        params: {
          access_token: accessToken,
          fields,
          limit: 200,
          filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]),
        },
      }
    );
    return response.data.data;
  }

  async getCampaignAdSets(
    accessToken: string,
    campaignId: string,
    dateParams?: { preset?: string; since?: string; until?: string }
  ): Promise<Array<Record<string, any>>> {
    const insightFields =
      'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,conversions,actions,action_values,purchase_roas';
    const dateParamStr = this.buildInsightsDateParams(dateParams);

    // Build insights sub-fields with optional date filter
    const insightsParam = dateParams?.since && dateParams?.until
      ? `insights.time_range(${JSON.stringify({ since: dateParams.since, until: dateParams.until })}){${insightFields}}`
      : dateParams?.preset
        ? `insights.date_preset(${dateParams.preset}){${insightFields}}`
        : `insights{${insightFields}}`;

    const response = await this.client.get<MetaApiResponse<Array<Record<string, any>>>>(
      `/${campaignId}/adsets`,
      {
        params: {
          access_token: accessToken,
          fields: `id,name,status,daily_budget,lifetime_budget,bid_amount,bid_strategy,optimization_goal,billing_event,start_time,end_time,${insightsParam}`,
          limit: 200,
        },
      }
    );

    // Insights are already embedded; no per-adset calls needed
    return (response.data.data || []).map((adSet) => ({
      ...adSet,
      insights: adSet.insights ? adSet.insights : { data: [] },
    }));
  }

  async getSingleAdSetWithInsights(
    accessToken: string,
    adSetId: string,
    dateParams?: { preset?: string; since?: string; until?: string }
  ): Promise<Record<string, any>> {
    const adSetResponse = await this.client.get<Record<string, any>>(`/${adSetId}`, {
      params: {
        access_token: accessToken,
        fields:
          'id,name,status,daily_budget,lifetime_budget,bid_amount,bid_strategy,optimization_goal,billing_event,start_time,end_time,campaign{id,name}',
      },
    });

    let insight: MetaInsightRaw | null = null;
    try {
      insight = await this.fetchEntityInsights(adSetId, accessToken, dateParams);
    } catch (error: any) {
      logger.warn(`⚠️ Failed to fetch insights for ad set ${adSetId}`, {
        error: error.message,
      });
    }

    return {
      ...adSetResponse.data,
      insights: { data: insight ? [insight] : [] },
    };
  }

  // ── Ads ───────────────────────────────────────────────────────────────────
  async getAds(accessToken: string, adAccountId: string): Promise<unknown[]> {
    const fields = [
      'id', 'name', 'status', 'adset_id', 'campaign_id',
      'creative{id,title,body,call_to_action_type,image_url,video_id,object_url,effective_instagram_story_id}',
      'insights.date_preset(last_30d){impressions,reach,clicks,spend,cpm,cpc,ctr,frequency,actions,action_values}',
    ].join(',');

    const response = await this.client.get<MetaApiResponse<unknown[]>>(
      `/${adAccountId}/ads`,
      {
        params: {
          access_token: accessToken,
          fields,
          limit: 500,
          filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]),
        },
      }
    );
    return response.data.data;
  }

  async getAdSetAds(
    accessToken: string,
    adSetId: string,
    dateParams?: { preset?: string; since?: string; until?: string }
  ): Promise<Array<Record<string, any>>> {
    const response = await this.client.get<MetaApiResponse<Array<Record<string, any>>>>(
      `/${adSetId}/ads`,
      {
        params: {
          access_token: accessToken,
          fields:
            'id,name,status,adset_id,campaign_id,creative{id,title,body,call_to_action_type,image_url,video_id,object_url,effective_instagram_story_id}',
          limit: 500,
        },
      }
    );

    const ads = response.data.data || [];

    return Promise.all(
      ads.map(async (ad) => {
        try {
          const insight = await this.fetchEntityInsights(ad.id, accessToken, dateParams);
          return {
            ...ad,
            insights: { data: insight ? [insight] : [] },
          };
        } catch (error: any) {
          logger.warn(`⚠️ Failed to fetch insights for ad ${ad.id}`, {
            error: error.message,
          });

          return {
            ...ad,
            insights: { data: [] },
          };
        }
      })
    );
  }

  // ── Insights (time series) ─────────────────────────────────────────────────
  async getCampaignInsights(
    accessToken: string,
    campaignId: string,
    dateRange: { since: string; until: string }
  ): Promise<MetaInsightRaw[]> {
    const response = await this.client.get<MetaApiResponse<MetaInsightRaw[]>>(
      `/${campaignId}/insights`,
      {
        params: {
          access_token: accessToken,
          fields: 'date_start,impressions,reach,clicks,spend,cpm,cpc,ctr,frequency,actions,action_values,purchase_roas',
          time_range: JSON.stringify(dateRange),
          time_increment: 1,
          limit: 90,
        },
      }
    );
    return response.data.data || [];
  }

  async getDailyAdAccountInsights(
    accessToken: string,
    adAccountId: string,
    days: number = 30,
    dateParams?: { preset?: string; since?: string; until?: string }
  ): Promise<Array<{ date: string; spend: number; roas: number; ctr: number; conversions: number }>> {
    const formattedAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

    // Build date filter params — prefer explicit dateParams over `days`
    let metaDateParams: Record<string, any>;
    if (dateParams?.since && dateParams?.until) {
      metaDateParams = {
        time_range: JSON.stringify({ since: dateParams.since, until: dateParams.until }),
        limit: 90,
      };
    } else if (dateParams?.preset) {
      metaDateParams = {
        date_preset: dateParams.preset,
        limit: 90,
      };
    } else {
      metaDateParams = {
        date_preset: days === 7 ? 'last_7d' : days === 14 ? 'last_14d' : days === 90 ? 'last_90d' : 'last_30d',
        limit: days,
      };
    }

    const response = await this.client.get<MetaApiResponse<Array<{ date_start: string; spend: string; ctr: string; actions?: Array<{ action_type: string; value: string }>; purchase_roas?: Array<{ value: string }> }>>>(
      `/${formattedAccountId}/insights`,
      {
        params: {
          access_token: accessToken,
          fields: 'spend,date_start,ctr,actions,action_values,purchase_roas',
          time_increment: 1,
          ...metaDateParams,
        },
      }
    );

    return (response.data.data || []).map((item: any) => {
      // Extract conversions from actions array
      const conversions = Number(
        item.actions?.find((a: any) => a.action_type === 'lead')?.value ||
        item.actions?.find((a: any) => a.action_type === 'purchase')?.value ||
        0
      );

      // Extract ROAS from purchase_roas array
      const roas = Number(item.purchase_roas?.[0]?.value || 0);

      // Calculate revenue for ROAS fallback
      const revenue = item.action_values?.reduce((sum: number, a: any) =>
        a.action_type === 'purchase' ? sum + Number(a.value || 0) : sum,
        0) || 0;

      const spend = Number(item.spend || 0);

      return {
        date: item.date_start,
        spend,
        roas: roas || (spend > 0 ? revenue / spend : 0),
        ctr: Number(item.ctr || 0),
        conversions,
      };
    });
  }

  // ── Data Normalization ─────────────────────────────────────────────────────
  normalizeMetrics(raw: MetaInsightRaw | undefined | null): Record<string, number> {
    // ── SAFE: Handle undefined/null input ──────────────────────────────
    if (!raw) {
      return {
        impressions: 0,
        reach: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
        cpm: 0,
        cpc: 0,
        ctr: 0,
        cpa: 0,
        roas: 0,
        frequency: 0,
      };
    }

    // ── Extract Conversions from actions array (Meta standard) ──────────
    const conversions =
      raw.actions?.find(a => a.action_type === 'lead')?.value ||
      raw.actions?.find(a => a.action_type === 'purchase')?.value ||
      raw.conversions?.reduce((sum, c) => {
        try {
          return ['purchase', 'lead', 'complete_registration'].includes(c.action_type)
            ? sum + parseFloat(c.value || '0')
            : sum;
        } catch {
          return sum;
        }
      }, 0) ||
      0;

    // ── Extract ROAS from purchase_roas array (Meta standard) ──────────
    const roas = Number(raw.purchase_roas?.[0]?.value || 0);

    const revenue = raw.action_values?.reduce((sum, a) => {
      try {
        return a.action_type === 'purchase' ? sum + parseFloat(a.value || '0') : sum;
      } catch {
        return sum;
      }
    }, 0) || 0;

    // ── SAFE: Parse numeric values with fallbacks ──────────────────────
    const spend = parseFloat(raw.spend || '0');
    const clicks = parseFloat(raw.clicks || '0');
    const ctr = Number(raw.ctr || 0);
    const conversionsNum = Number(conversions);

    return {
      impressions: parseInt(raw.impressions || '0'),
      reach: parseInt(raw.reach || '0'),
      clicks,
      spend,
      conversions: conversionsNum,
      cpm: parseFloat(raw.cpm || '0'),
      cpc: parseFloat(raw.cpc || '0'),
      ctr,
      cpa: conversionsNum > 0 ? spend / conversionsNum : 0,
      roas: roas || (spend > 0 ? revenue / spend : 0),
      frequency: parseFloat(raw.frequency || '0'),
    };
  }

  // ── Ad Account Insights (Robust Implementation) ────────────────────────────
  /**
   * Fetches campaign-level insights from Meta Graph API with retry logic & detailed error handling
   * @param adAccountId - Ad account ID (format: act_xxxxx)
   * @param accessToken - Meta API access token
   * @param maxRetries - Number of retries on failure (default: 2)
   * @returns Array of normalized insight objects
   */
  async getAdInsights(
    adAccountId: string,
    accessToken: string,
    maxRetries: number = 2
  ): Promise<Array<Record<string, any>>> {
    let lastError: any = null;

    // Format ad account ID
    const formattedAccountId = adAccountId.startsWith('act_')
      ? adAccountId
      : `act_${adAccountId}`;

    // ── Validate Token ─────────────────────────────────────────────────────
    if (!accessToken?.trim()) {
      const error = new Error('Invalid or missing access token');
      logger.error('❌ Meta Insights Fetch Failed', {
        reason: 'missing_token',
        adAccountId: formattedAccountId,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }

    // ── Retry Logic ────────────────────────────────────────────────────────
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`📊 [Attempt ${attempt + 1}/${maxRetries + 1}] Fetching insights for ${formattedAccountId}`);

        const response = await this.client.get(`/${formattedAccountId}/insights`, {
          params: {
            access_token: accessToken,
            fields:
              'campaign_name,adset_name,impressions,reach,spend,cpc,ctr,actions,action_values,conversions,clicks,cpm,frequency,purchase_roas',
            date_preset: 'last_30d',
            level: 'campaign',
            limit: 500,
          },
        });

        // ── Validate Response ──────────────────────────────────────────────
        if (!response.data || !Array.isArray(response.data.data)) {
          logger.warn('⚠️ Empty or malformed Meta API response', {
            adAccountId: formattedAccountId,
            responseStatus: response.status,
            hasData: !!response.data?.data,
          });

          return []; // Return empty array for empty data
        }

        const rawInsights = response.data.data;

        logger.info(`✅ Successfully fetched ${rawInsights.length} insights records`, {
          adAccountId: formattedAccountId,
          recordCount: rawInsights.length,
          timestamp: new Date().toISOString(),
        });

        // ── Normalize & Return Data ────────────────────────────────────────
        console.log('📊 Raw insights from Meta:', rawInsights);
        
        return rawInsights.map((insight: MetaInsightRaw) => {
          // Extract conversions from actions array or conversions array
          const conversions =
            insight.actions?.find(a => a.action_type === 'lead')?.value ||
            insight.actions?.find(a => a.action_type === 'purchase')?.value ||
            insight.conversions?.reduce((sum: number, c: any) =>
              ['purchase', 'lead', 'complete_registration'].includes(c.action_type)
                ? sum + parseFloat(c.value || '0')
                : sum,
              0) ||
            0;

          // Extract ROAS from purchase_roas array
          const roas = Number(insight.purchase_roas?.[0]?.value || 0);

          // Extract revenue from action_values
          const revenue =
            insight.action_values?.reduce((sum: number, a: any) =>
              a.action_type === 'purchase' ? sum + parseFloat(a.value || '0') : sum,
              0) || 0;

          const spend = parseFloat(insight.spend || '0');
          const ctr = Number(insight.ctr || 0);
          const conversionsNum = Number(conversions);

          console.log(`INSIGHT: Campaign ${insight.campaign_name}`, {
            conversions: conversionsNum,
            actions: insight.actions,
            roas,
            purchase_roas: insight.purchase_roas,
            ctr,
            spend,
            revenue,
          });

          return {
            campaign_name: insight.campaign_name || 'Unknown Campaign',
            campaign_id: insight.campaign_id,
            impressions: parseInt(insight.impressions || '0'),
            reach: parseInt(insight.reach || '0'),
            clicks: parseInt(insight.clicks || '0'),
            spend,
            cpm: parseFloat(insight.cpm || '0'),
            cpc: parseFloat(insight.cpc || '0'),
            ctr,
            frequency: parseFloat(insight.frequency || '0'),
            conversions: conversionsNum,
            roas: roas || (spend > 0 ? revenue / spend : 0),
            revenue,
          };
        });
      } catch (error: any) {
        lastError = error;

        const metaErrorData = error.response?.data?.error;
        const statusCode = error.response?.status;

        // ── Detailed Error Logging ─────────────────────────────────────────
        logger.error('❌ Meta Insights Fetch Error (Attempt ' + (attempt + 1) + ')', {
          errorType: metaErrorData?.type || error.name,
          errorCode: metaErrorData?.code,
          errorMessage: metaErrorData?.message || error.message,
          httpStatus: statusCode,
          adAccountId: formattedAccountId,
          tokenMasked: accessToken ? `${accessToken.substring(0, 10)}...` : 'none',
          fullMetaError: metaErrorData,
          retry: attempt < maxRetries,
        });

        // ── Handle Specific Errors ─────────────────────────────────────────
        if (statusCode === 401 || metaErrorData?.code === 190) {
          const err = new Error('Invalid OAuth token. Please reconnect to Meta.');
          (err as any).code = 'AUTH_FAILED';
          throw err;
        }

        if (statusCode === 403 || metaErrorData?.code === 200) {
          const err = new Error(
            'Missing permissions. Required: ads_read, ads_management'
          );
          (err as any).code = 'PERMISSION_DENIED';
          throw err;
        }

        if (statusCode === 429) {
          const err = new Error('Rate limited by Meta API. Please retry in 1 minute.');
          (err as any).code = 'RATE_LIMITED';
          throw err;
        }

        // ── Retry on Transient Errors ──────────────────────────────────────
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000; // Exponential backoff
          logger.info(`⏳ Retrying in ${delayMs}ms...`, { attempt, maxRetries });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    // ── All Retries Exhausted ──────────────────────────────────────────────
    const finalError = lastError as any;
    logger.error('💥 All retry attempts failed for insights fetch', {
      adAccountId: formattedAccountId,
      totalAttempts: maxRetries + 1,
      lastError: finalError.message,
      errorCode: finalError.code,
    });

    throw new Error(
      `Failed to fetch Meta insights after ${maxRetries + 1} attempts: ${finalError.message}`
    );
  }

  // ── Token Encryption ──────────────────────────────────────────────────────
  encryptToken(token: string): string {
    const key = Buffer.from(config.encryptionKey.padEnd(32).slice(0, 32));
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decryptToken(encryptedToken: string): string {
    const [ivHex, encryptedHex] = encryptedToken.split(':');
    const key = Buffer.from(config.encryptionKey.padEnd(32).slice(0, 32));
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  // ── Breakdown Insights ────────────────────────────────────────────────────
  /**
   * Fetches performance breakdown for any entity (campaign, adset, ad)
   * breakdown: 'age' | 'gender' | 'country' | 'publisher_platform' | 'impression_device' | 'placement'
   */
  async getEntityBreakdown(
    entityId: string,
    accessToken: string,
    breakdown: string,
    dateParams?: { preset?: string; since?: string; until?: string }
  ): Promise<Array<Record<string, any>>> {
    // Map user-friendly names to Meta breakdown parameter values
    const breakdownMap: Record<string, string> = {
      age: 'age',
      gender: 'gender',
      location: 'country',
      country: 'country',
      platform: 'publisher_platform',
      placement: 'impression_device',
      device: 'impression_device',
    };

    const metaBreakdown = breakdownMap[breakdown] || breakdown;

    try {
      const response = await this.client.get(`/${entityId}/insights`, {
        params: {
          access_token: accessToken,
          fields: 'impressions,reach,clicks,spend,ctr,cpc,cpm,actions,conversions',
          breakdowns: metaBreakdown,
          limit: 100,
          ...this.buildInsightsDateParams(dateParams),
        },
      });

      const rows = response.data?.data || [];
      return rows.map((row: any) => {
        const conversions = Number(
          row.actions?.find((a: any) => a.action_type === 'lead')?.value ||
          row.actions?.find((a: any) => a.action_type === 'purchase')?.value ||
          0
        );
        return {
          dimension: row[metaBreakdown] || row.age || row.gender || row.country || row.publisher_platform || row.impression_device || 'unknown',
          impressions: Number(row.impressions || 0),
          reach: Number(row.reach || 0),
          clicks: Number(row.clicks || 0),
          spend: Number(row.spend || 0),
          ctr: Number(row.ctr || 0),
          cpc: Number(row.cpc || 0),
          cpm: Number(row.cpm || 0),
          conversions,
        };
      });
    } catch (error: any) {
      logger.warn(`⚠️ Failed to fetch ${breakdown} breakdown for ${entityId}`, {
        error: error.message,
      });
      return [];
    }
  }

  async getEntityBreakdowns(
    entityId: string,
    accessToken: string,
    breakdowns: string[],
    dateParams?: { preset?: string; since?: string; until?: string }
  ): Promise<Record<string, Array<Record<string, any>>>> {
    const results = await Promise.all(
      breakdowns.map(async (breakdown) => [
        breakdown,
        await this.getEntityBreakdown(entityId, accessToken, breakdown, dateParams),
      ] as const)
    );

    return results.reduce<Record<string, Array<Record<string, any>>>>((acc, [breakdown, rows]) => {
      acc[breakdown] = rows;
      return acc;
    }, {});
  }

  // ── Single Ad with Full Details ───────────────────────────────────────────
  async getSingleAdWithInsights(
    accessToken: string,
    adId: string,
    dateParams?: { preset?: string; since?: string; until?: string }
  ): Promise<Record<string, any>> {
    const adResponse = await this.client.get<Record<string, any>>(`/${adId}`, {
      params: {
        access_token: accessToken,
        fields:
          'id,name,status,adset_id,campaign_id,adset{id,name},campaign{id,name},creative{id,title,body,call_to_action_type,image_url,video_id,object_url}',
      },
    });

    let insight: MetaInsightRaw | null = null;
    try {
      insight = await this.fetchEntityInsights(adId, accessToken, dateParams);
    } catch (err: any) {
      logger.warn(`⚠️ Failed to fetch insights for ad ${adId}`, { error: err.message });
    }

    return {
      ...adResponse.data,
      insights: { data: insight ? [insight] : [] },
    };
  }

  // ── Lead Gen Forms / Leads ────────────────────────────────────────────────
  /**
   * Fetches leads from the Meta Lead Gen API.
   * Requires: ads_read + leads_retrieval permissions.
   * The form_id is obtained from the ad's lead_gen_id field.
   */
  async getAdLeads(
    accessToken: string,
    adId: string,
    limit = 50
  ): Promise<Array<Record<string, any>>> {
    try {
      // First get the ad's leadgen form id
      const adResponse = await this.client.get<Record<string, any>>(`/${adId}`, {
        params: {
          access_token: accessToken,
          fields: 'id,name,adset_id,campaign_id,lead_gen_id',
        },
      });

      const formId = adResponse.data?.lead_gen_id;
      if (!formId) {
        logger.info(`ℹ️ Ad ${adId} has no lead gen form attached`);
        return [];
      }

      const leadsResponse = await this.client.get<MetaApiResponse<Array<Record<string, any>>>>(
        `/${formId}/leads`,
        {
          params: {
            access_token: accessToken,
            fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,platform',
            limit,
          },
        }
      );

      const leads = leadsResponse.data?.data || [];
      return leads.map((lead: any) => {
        // Meta returns field_data as [{name, values}] array
        const fields: Record<string, string> = {};
        (lead.field_data || []).forEach((f: any) => {
          fields[f.name] = Array.isArray(f.values) ? f.values[0] : f.values;
        });
        return {
          id: lead.id,
          createdAt: lead.created_time,
          name: fields.full_name || fields.first_name
            ? `${fields.first_name || ''} ${fields.last_name || ''}`.trim()
            : fields.name || 'Unknown',
          email: fields.email || '',
          phone: fields.phone_number || fields.phone || '',
          source: lead.platform || 'Facebook',
          adId: lead.ad_id || adId,
          adName: lead.ad_name || '',
          adSetId: lead.adset_id || '',
          adSetName: lead.adset_name || '',
          campaignId: lead.campaign_id || '',
          campaignName: lead.campaign_name || '',
          rawFields: fields,
        };
      });
    } catch (error: any) {
      logger.warn(`⚠️ Failed to fetch leads for ad ${adId}`, { error: error.message });
      return [];
    }
  }
}

export const metaService = new MetaService();
