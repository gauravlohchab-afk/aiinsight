import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IAIInsight extends Document {
  userId: mongoose.Types.ObjectId;
  adAccountId: string;
  campaignId?: string;
  campaignIds?: mongoose.Types.ObjectId[];
  type: 'audience_analysis' | 'performance_review' | 'creative_feedback' | 'budget_optimization';
  audienceDefinition?: {
    ageRange?: { min: number; max: number };
    locations?: string[];
    interests?: string[];
    painPoints?: string[];
    description?: string;
  };
  input: {
    campaignData: Record<string, unknown>;
    metrics: Record<string, unknown>;
    targeting?: Record<string, unknown>;
  };
  output: {
    alignmentScore?: number;
    summary?: string;
    insights?: string[];
    gaps?: string[];
    recommendations?: string[];
    rawResponse?: string;
  };
  result?: Record<string, unknown>;
  tokensUsed?: number;
  processingTimeMs?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AIInsightSchema = new Schema<IAIInsight>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    adAccountId: { type: String, required: true },
    campaignId: { type: String },
    campaignIds: [{ type: Schema.Types.ObjectId, ref: 'Campaign' }],
    type: {
      type: String,
      enum: ['audience_analysis', 'performance_review', 'creative_feedback', 'budget_optimization'],
      required: true,
    },
    audienceDefinition: {
      ageRange: { min: Number, max: Number },
      locations: [String],
      interests: [String],
      painPoints: [String],
      description: String,
    },
    input: {
      campaignData: Schema.Types.Mixed,
      metrics: Schema.Types.Mixed,
      targeting: Schema.Types.Mixed,
    },
    output: {
      alignmentScore: { type: Number, min: 0, max: 10, default: 0 },
      summary: String,
      insights: [String],
      gaps: [String],
      recommendations: [String],
      rawResponse: String,
    },
    result: Schema.Types.Mixed,
    tokensUsed: Number,
    processingTimeMs: Number,
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    error: String,
  },
  { timestamps: true }
);

AIInsightSchema.index({ userId: 1, createdAt: -1 });
AIInsightSchema.index({ userId: 1, type: 1 });
AIInsightSchema.index({ userId: 1, adAccountId: 1, createdAt: -1 });

export const AIInsight: Model<IAIInsight> = mongoose.model<IAIInsight>(
  'AIInsight',
  AIInsightSchema
);
