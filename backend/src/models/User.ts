import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  password?: string;
  name: string;
  avatar?: string;
  role: 'user' | 'admin';
  metaAuth?: {
    accessToken: string;
    tokenExpiresAt: Date;
    userId: string;
    adAccountIds: string[];
    adAccounts: Array<{ id: string; name: string }>;
  };
  subscription: {
    plan: 'free' | 'pro' | 'agency';
    status: 'active' | 'inactive' | 'trial';
    trialEndsAt?: Date;
  };
  preferences: {
    theme: 'dark' | 'light';
    notifications: boolean;
    defaultDateRange: '7d' | '30d' | '90d';
  };
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  isMetaConnected(): boolean;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      minlength: 8,
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    avatar: String,
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    metaAuth: {
      accessToken: { type: String, select: false },
      tokenExpiresAt: Date,
      userId: String,
      adAccountIds: [String],
      adAccounts: [{ id: String, name: String }],
    },
    subscription: {
      plan: {
        type: String,
        enum: ['free', 'pro', 'agency'],
        default: 'free',
      },
      status: {
        type: String,
        enum: ['active', 'inactive', 'trial'],
        default: 'trial',
      },
      trialEndsAt: Date,
    },
    preferences: {
      theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
      notifications: { type: Boolean, default: true },
      defaultDateRange: {
        type: String,
        enum: ['7d', '30d', '90d'],
        default: '30d',
      },
    },
    lastLoginAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Hash password before save
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.isMetaConnected = function (): boolean {
  return !!(
    this.metaAuth?.accessToken &&
    this.metaAuth?.tokenExpiresAt &&
    new Date() < this.metaAuth.tokenExpiresAt
  );
};

// Remove sensitive fields from JSON output
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.metaAuth?.accessToken;
  return obj;
};

export const User: Model<IUser> = mongoose.model<IUser>('User', UserSchema);
