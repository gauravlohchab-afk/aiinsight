import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMetrics {
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  conversions: number;
  cpm: number;
  cpc: number;
  ctr: number;
  cpa: number;
  roas: number;
  frequency: number;
  date?: Date;
}

export interface ICampaign extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  metaCampaignId: string;
  adAccountId: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
  objective: string;
  buyingType: string;
  budget: {
    daily?: number;
    lifetime?: number;
    currency: string;
  };
  schedule: {
    startTime?: Date;
    endTime?: Date;
  };
  metrics: IMetrics;
  historicalMetrics: IMetrics[];
  healthScore: number;
  anomalies: Array<{
    metric: string;
    type: 'spike' | 'drop';
    percentage: number;
    detectedAt: Date;
    message: string;
  }>;
  suggestions: Array<{
    title: string;
    reason: string;
    impact: 'high' | 'medium' | 'low';
    priority: number;
    type: string;
    applied: boolean;
    createdAt: Date;
  }>;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MetricsSchema = new Schema<IMetrics>(
  {
    impressions: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    spend: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    cpm: { type: Number, default: 0 },
    cpc: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 },
    cpa: { type: Number, default: 0 },
    roas: { type: Number, default: 0 },
    frequency: { type: Number, default: 0 },
    date: Date,
  },
  { _id: false }
);

const CampaignSchema = new Schema<ICampaign>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    metaCampaignId: {
      type: String,
      required: true,
      index: true,
    },
    adAccountId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'],
      default: 'ACTIVE',
    },
    objective: String,
    buyingType: String,
    budget: {
      daily: Number,
      lifetime: Number,
      currency: { type: String, default: 'USD' },
    },
    schedule: {
      startTime: Date,
      endTime: Date,
    },
    metrics: { type: MetricsSchema, default: {} },
    historicalMetrics: [MetricsSchema],
    healthScore: { type: Number, default: 0, min: 0, max: 100 },
    anomalies: [
      {
        metric: String,
        type: { type: String, enum: ['spike', 'drop'] },
        percentage: Number,
        detectedAt: { type: Date, default: Date.now },
        message: String,
      },
    ],
    suggestions: [
      {
        title: String,
        reason: String,
        impact: { type: String, enum: ['high', 'medium', 'low'] },
        priority: { type: Number, default: 1 },
        type: String,
        applied: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    lastSyncedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Compound index for efficient queries
CampaignSchema.index({ userId: 1, status: 1 });
CampaignSchema.index({ userId: 1, adAccountId: 1 });
CampaignSchema.index({ userId: 1, healthScore: -1 });
CampaignSchema.index({ metaCampaignId: 1, userId: 1 }, { unique: true });

export const Campaign: Model<ICampaign> = mongoose.model<ICampaign>(
  'Campaign',
  CampaignSchema
);

// Export MetricsSchema for use in other models
export { MetricsSchema };
