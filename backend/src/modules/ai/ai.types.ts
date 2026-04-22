import mongoose from 'mongoose';

export interface AudienceDefinition {
  ageRange?: { min: number; max: number };
  locations?: string[];
  interests?: string[];
  painPoints?: string[];
  description?: string;
}

export interface AIAnalysisOutput {
  alignment_score: number;
  gaps: string[];
  recommendations: string[];
}

export interface AdReviewItem {
  adId: string;
  adName: string;
  status: 'good' | 'average' | 'poor';
  spend: number;
  ctr: number;
  conversions: number;
  insights: string[];
  recommendations: string[];
}

export interface CampaignReviewItem {
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

export interface PerformanceReviewOutput {
  overallSummary: string;
  campaigns: CampaignReviewItem[];
  overall_assessment?: string;
  top_performing_campaigns?: string[];
  underperforming_campaigns?: string[];
  budget_reallocation?: string[];
  quick_wins?: string[];
  strategic_changes?: string[];
}

export interface AnalyzeAudienceInput {
  userId: mongoose.Types.ObjectId;
  adAccountId: string;
  audienceDefinition: AudienceDefinition;
  campaignIds?: string[];
}

export interface AnalyzeCreativesInput {
  userId: mongoose.Types.ObjectId;
  adAccountId: string;
}

export interface OptimizeBudgetInput {
  userId: mongoose.Types.ObjectId;
  adAccountId: string;
  totalBudget: number;
}

export interface PerformanceReviewInput {
  userId: mongoose.Types.ObjectId;
  adAccountId: string;
}

export interface InsightHistoryItem {
  _id: mongoose.Types.ObjectId;
  type: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  score?: number;
  summary: string;
  insights: string[];
  recommendations: string[];
  result: Record<string, unknown>;
}

export interface GetInsightHistoryInput {
  userId: mongoose.Types.ObjectId;
  limit: number;
}

export interface ImprovementSuggestionsInput {
  userId: mongoose.Types.ObjectId;
  adAccountId?: string;
  campaignId?: string;
  adsetId?: string;
  metrics?: Record<string, unknown>;
}

export interface ImprovementSuggestionsResult {
  suggestions: string[];
  source: 'ai' | 'rules' | 'fallback';
  contextName: string;
}
