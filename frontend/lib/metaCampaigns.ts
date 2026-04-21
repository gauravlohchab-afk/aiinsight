type MetaAction = {
  action_type?: string;
  value?: string | number;
};

type MetaInsight = {
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  reach?: string | number;
  frequency?: string | number;
  ctr?: string | number;
  cpc?: string | number;
  cpm?: string | number;
  actions?: MetaAction[] | Record<string, number>;
  conversions?: MetaAction[] | Record<string, number> | number;
  action_values?: MetaAction[] | Record<string, number>;
  purchase_roas?: Array<{ value: string | number }>;
};

type MetaCampaign = {
  _id?: string;
  id?: string;
  name?: string;
  status?: string;
  objective?: string;
  healthScore?: number;
  anomalies?: unknown[];
  suggestions?: unknown[];
  metrics?: {
    spend?: number;
    roas?: number;
    ctr?: number;
    cpa?: number;
    cpc?: number;
    conversions?: number;
  };
  insights?: {
    data?: MetaInsight[];
  };
};

const CONVERSION_ACTION_TYPES = [
  'purchase',
  'omni_purchase',
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'complete_registration',
  'offsite_conversion.fb_pixel_complete_registration',
  'subscribe',
];

const REVENUE_ACTION_TYPES = [
  'purchase',
  'omni_purchase',
  'offsite_conversion.fb_pixel_purchase',
];

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function sumActionValues(actions: MetaAction[] | Record<string, number> | undefined, types: string[]): number {
  if (!actions) return 0;

  // Handle Record<string, number> format (backend response)
  if (!Array.isArray(actions)) {
    return types.reduce((sum, type) => sum + (actions[type] || 0), 0);
  }

  // Handle MetaAction[] format (API response)
  return actions.reduce((sum, action) => {
    if (!action.action_type || !types.includes(action.action_type)) {
      return sum;
    }

    return sum + toNumber(action.value);
  }, 0);
}

export function getCampaignStatus(status?: string): string {
  return status?.toUpperCase() || 'UNKNOWN';
}

export function getCampaignMetrics(campaign: MetaCampaign) {
  const insight = campaign.insights?.data?.[0];
  const spend = toNumber(insight?.spend ?? campaign.metrics?.spend);
  const ctr = toNumber(insight?.ctr ?? campaign.metrics?.ctr);
  const cpc = toNumber(insight?.cpc ?? campaign.metrics?.cpc ?? campaign.metrics?.cpa);
  
  // Handle conversions: try actions array first (Meta standard), then conversions array, then number
  let conversions = 0;
  if (typeof insight?.conversions === 'number') {
    conversions = insight.conversions;
  } else if (insight?.actions && Array.isArray(insight.actions)) {
    // Extract from actions array - look for lead or purchase
    conversions = toNumber(
      insight.actions.find((a: MetaAction) => a.action_type === 'lead')?.value ||
      insight.actions.find((a: MetaAction) => a.action_type === 'purchase')?.value
    ) || sumActionValues(insight?.actions, CONVERSION_ACTION_TYPES)
      || sumActionValues(insight?.conversions, CONVERSION_ACTION_TYPES)
      || toNumber(campaign.metrics?.conversions);
  } else {
    conversions = sumActionValues(insight?.actions, CONVERSION_ACTION_TYPES)
      || sumActionValues(insight?.conversions, CONVERSION_ACTION_TYPES)
      || toNumber(campaign.metrics?.conversions);
  }
  
  // Extract ROAS from purchase_roas (Meta standard) first, then calculate from revenue
  let roas = 0;
  if (insight?.purchase_roas && Array.isArray(insight.purchase_roas) && insight.purchase_roas.length > 0) {
    roas = toNumber(insight.purchase_roas[0].value);
  } else {
    const revenue = sumActionValues(insight?.action_values, REVENUE_ACTION_TYPES);
    roas = spend > 0 ? revenue / spend : toNumber(campaign.metrics?.roas);
  }
  
  const cpa = conversions > 0 ? spend / conversions : cpc;

  return {
    spend,
    ctr,
    cpc,
    conversions,
    roas,
    cpa,
  };
}

export function getDetailedCampaignMetrics(campaign: MetaCampaign) {
  const insight = campaign.insights?.data?.[0];
  const basicMetrics = getCampaignMetrics(campaign);

  // Safely extract all fields with fallbacks
  const impressions = toNumber(insight?.impressions) || 0;
  const clicks = toNumber(insight?.clicks) || 0;
  const reach = toNumber(insight?.reach) || 0;
  const frequency = toNumber(insight?.frequency) || 0;
  const cpm = toNumber(insight?.cpm) || 0;
  const revenue = sumActionValues(insight?.action_values, REVENUE_ACTION_TYPES) || 0;

  console.log('📊 [getDetailedCampaignMetrics] Extracted:', {
    id: campaign._id || campaign.id,
    name: campaign.name,
    hasInsight: !!insight,
    impressions,
    clicks,
    spend: basicMetrics.spend,
    roas: basicMetrics.roas,
  });

  return {
    ...basicMetrics,
    impressions,
    clicks,
    reach,
    frequency,
    cpm,
    revenue,
  };
}

export function normalizeCampaign(campaign: MetaCampaign) {
  const metrics = getCampaignMetrics(campaign);

  console.log('📊 [normalizeCampaign] Metrics extracted:', {
    id: campaign._id || campaign.id,
    name: campaign.name,
    insightsPresent: !!campaign.insights?.data?.length,
    metricsPresent: !!campaign.metrics,
    spend: metrics.spend,
    roas: metrics.roas,
    ctr: metrics.ctr,
    cpa: metrics.cpa,
  });

  return {
    ...campaign,
    _id: campaign._id || campaign.id,
    id: campaign.id || campaign._id,
    name: campaign.name || 'Unnamed Campaign',
    status: getCampaignStatus(campaign.status),
    metrics: {
      ...campaign.metrics,
      ...metrics,
    },
    healthScore: campaign.healthScore || 0,
    anomalies: campaign.anomalies || [],
    suggestions: campaign.suggestions || [],
  };
}

export function matchesStatusFilter(status: string, filter: 'all' | 'ACTIVE' | 'PAUSED') {
  if (filter === 'ACTIVE') {
    return status === 'ACTIVE';
  }

  if (filter === 'PAUSED') {
    return status === 'PAUSED';
  }

  return true;
}

export function sortCampaigns<T extends MetaCampaign>(campaigns: T[], sort: 'healthScore' | 'spend' | 'roas' | 'ctr' | 'name') {
  return [...campaigns].sort((left, right) => {
    const leftCampaign = normalizeCampaign(left);
    const rightCampaign = normalizeCampaign(right);

    if (sort === 'name') {
      return leftCampaign.name.localeCompare(rightCampaign.name);
    }

    if (sort === 'healthScore') {
      return (rightCampaign.healthScore || 0) - (leftCampaign.healthScore || 0);
    }

    return (rightCampaign.metrics?.[sort] || 0) - (leftCampaign.metrics?.[sort] || 0);
  });
}

export function buildDashboardTotals(campaigns: MetaCampaign[]) {
  const normalizedCampaigns = campaigns.map(normalizeCampaign);
  
  // Use already-extracted metrics from getCampaignMetrics (called by normalizeCampaign)
  const totalSpend = normalizedCampaigns.reduce(
    (sum, campaign) => sum + (campaign.metrics?.spend || 0),
    0
  );
  
  const totalRevenue = normalizedCampaigns.reduce(
    (sum, campaign) => sum + (campaign.metrics?.spend || 0) * (campaign.metrics?.roas || 0),
    0
  );
  
  const totalConversions = normalizedCampaigns.reduce(
    (sum, campaign) => sum + (campaign.metrics?.conversions || 0),
    0
  );
  
  const totalCtrWeighted = normalizedCampaigns.reduce(
    (sum, campaign) => sum + (campaign.metrics?.ctr || 0) * (campaign.metrics?.spend || 0),
    0
  );

  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const avgCtr = totalSpend > 0 ? totalCtrWeighted / totalSpend : 0;
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  console.log('📊 [buildDashboardTotals] Calculated:', {
    totalSpend,
    totalRevenue,
    totalConversions,
    avgRoas,
    avgCtr,
    avgCpa,
    campaignCount: normalizedCampaigns.length,
  });

  return {
    totalSpend,
    avgRoas: isFinite(avgRoas) ? avgRoas : 0,
    avgCtr: isFinite(avgCtr) ? avgCtr : 0,
    avgCpa: isFinite(avgCpa) ? avgCpa : 0,
  };
}
