import mongoose, { Schema, Document, Model } from 'mongoose';
import { IMetrics, MetricsSchema } from './Campaign';

// Re-export for use in other files
export { IMetrics };

export interface IAdSet extends Document {
  userId: mongoose.Types.ObjectId;
  campaignId: mongoose.Types.ObjectId;
  metaAdSetId: string;
  metaCampaignId: string;
  adAccountId: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
  targeting: {
    ageMin?: number;
    ageMax?: number;
    genders?: number[];
    geoLocations?: Record<string, unknown>;
    interests?: Array<{ id: string; name: string }>;
    customAudiences?: Array<{ id: string; name: string }>;
    excludedCustomAudiences?: Array<{ id: string; name: string }>;
    devicePlatforms?: string[];
    publisherPlatforms?: string[];
  };
  budget: {
    daily?: number;
    lifetime?: number;
    currency: string;
    bidAmount?: number;
    bidStrategy?: string;
  };
  optimization: {
    goal: string;
    event?: string;
    billingEvent: string;
  };
  schedule: {
    startTime?: Date;
    endTime?: Date;
  };
  metrics: IMetrics;
  historicalMetrics: IMetrics[];
  creativeFatigue: {
    detected: boolean;
    ctrDeclinePercentage?: number;
    detectedAt?: Date;
  };
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AdSetSchema = new Schema<IAdSet>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    metaAdSetId: { type: String, required: true, index: true },
    metaCampaignId: { type: String, required: true },
    adAccountId: { type: String, required: true },
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'],
      default: 'ACTIVE',
    },
    targeting: {
      ageMin: Number,
      ageMax: Number,
      genders: [Number],
      geoLocations: Schema.Types.Mixed,
      interests: [{ id: String, name: String }],
      customAudiences: [{ id: String, name: String }],
      excludedCustomAudiences: [{ id: String, name: String }],
      devicePlatforms: [String],
      publisherPlatforms: [String],
    },
    budget: {
      daily: Number,
      lifetime: Number,
      currency: { type: String, default: 'USD' },
      bidAmount: Number,
      bidStrategy: String,
    },
    optimization: {
      goal: String,
      event: String,
      billingEvent: String,
    },
    schedule: {
      startTime: Date,
      endTime: Date,
    },
    metrics: { type: Schema.Types.Mixed, default: {} },
    historicalMetrics: [Schema.Types.Mixed],
    creativeFatigue: {
      detected: { type: Boolean, default: false },
      ctrDeclinePercentage: Number,
      detectedAt: Date,
    },
    lastSyncedAt: Date,
  },
  { timestamps: true }
);

AdSetSchema.index({ userId: 1, metaAdSetId: 1 }, { unique: true });
AdSetSchema.index({ campaignId: 1 });

export const AdSet: Model<IAdSet> = mongoose.model<IAdSet>('AdSet', AdSetSchema);
