import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAd extends Document {
  userId: mongoose.Types.ObjectId;
  adSetId: mongoose.Types.ObjectId;
  campaignId: mongoose.Types.ObjectId;
  metaAdId: string;
  metaAdSetId: string;
  metaCampaignId: string;
  adAccountId: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
  creative: {
    metaCreativeId?: string;
    title?: string;
    body?: string;
    callToAction?: string;
    imageUrl?: string;
    videoUrl?: string;
    linkUrl?: string;
    format?: string;
  };
  metrics: {
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
  };
  historicalMetrics: Array<{
    impressions: number;
    reach: number;
    clicks: number;
    spend: number;
    ctr: number;
    cpc: number;
    date: Date;
  }>;
  creativeFatigue: {
    detected: boolean;
    ctrDeclinePercentage?: number;
    detectedAt?: Date;
    recommendation?: string;
  };
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AdSchema = new Schema<IAd>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    adSetId: { type: Schema.Types.ObjectId, ref: 'AdSet', required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    metaAdId: { type: String, required: true, index: true },
    metaAdSetId: { type: String, required: true },
    metaCampaignId: { type: String, required: true },
    adAccountId: { type: String, required: true },
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'],
      default: 'ACTIVE',
    },
    creative: {
      metaCreativeId: String,
      title: String,
      body: String,
      callToAction: String,
      imageUrl: String,
      videoUrl: String,
      linkUrl: String,
      format: String,
    },
    metrics: {
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
    },
    historicalMetrics: [
      {
        impressions: Number,
        reach: Number,
        clicks: Number,
        spend: Number,
        ctr: Number,
        cpc: Number,
        date: Date,
        _id: false,
      },
    ],
    creativeFatigue: {
      detected: { type: Boolean, default: false },
      ctrDeclinePercentage: Number,
      detectedAt: Date,
      recommendation: String,
    },
    lastSyncedAt: Date,
  },
  { timestamps: true }
);

AdSchema.index({ userId: 1, metaAdId: 1 }, { unique: true });
AdSchema.index({ adSetId: 1 });
AdSchema.index({ campaignId: 1 });

export const Ad: Model<IAd> = mongoose.model<IAd>('Ad', AdSchema);
