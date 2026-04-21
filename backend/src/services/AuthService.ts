import jwt from 'jsonwebtoken';
import { config, logger } from '../config';
import { User, IUser } from '../models/User';
import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler';

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  // ── Token Generation ──────────────────────────────────────────────────────
  generateTokens(user: IUser): AuthTokens {
    const payload: TokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
      issuer: 'adinsight',
      audience: 'adinsight-client',
    });

    const refreshToken = jwt.sign(
      { userId: user._id.toString() },
      config.jwt.refreshSecret,
      {
        expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
        issuer: 'adinsight',
      }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    };
  }

  // ── Token Verification ─────────────────────────────────────────────────────
  verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, config.jwt.secret, {
      issuer: 'adinsight',
      audience: 'adinsight-client',
    }) as TokenPayload;
  }

  verifyRefreshToken(token: string): { userId: string } {
    return jwt.verify(token, config.jwt.refreshSecret, {
      issuer: 'adinsight',
    }) as { userId: string };
  }

  // ── Register ──────────────────────────────────────────────────────────────
  async register(
    email: string,
    password: string,
    name: string
  ): Promise<{ user: IUser; tokens: AuthTokens }> {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new AppError('Email already registered', 409);
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14); // 14-day trial

    const user = await User.create({
      email: email.toLowerCase(),
      password,
      name,
      subscription: {
        plan: 'free',
        status: 'trial',
        trialEndsAt,
      },
    });

    const tokens = this.generateTokens(user);
    logger.info(`New user registered: ${email}`);

    return { user, tokens };
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  async login(
    email: string,
    password: string
  ): Promise<{ user: IUser; tokens: AuthTokens }> {
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401);
    }

    user.lastLoginAt = new Date();
    await user.save();

    const tokens = this.generateTokens(user);
    return { user, tokens };
  }

  // ── Refresh Token ─────────────────────────────────────────────────────────
  async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const decoded = this.verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.userId);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const payload: TokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
      issuer: 'adinsight',
      audience: 'adinsight-client',
    });

    return { accessToken, expiresIn: 7 * 24 * 60 * 60 };
  }

  // ── Meta OAuth ─────────────────────────────────────────────────────────────
  async handleMetaCallback(
    userId: string | mongoose.Types.ObjectId,
    accessToken: string,
    tokenExpiresIn: number,
    metaUserId: string,
    adAccountIds: string[],
    adAccounts?: Array<{ id: string; name: string }>
  ): Promise<IUser> {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenExpiresIn);

    const user = await User.findByIdAndUpdate(
      userId,
      {
        'metaAuth.accessToken': accessToken,
        'metaAuth.tokenExpiresAt': expiresAt,
        'metaAuth.userId': metaUserId,
        'metaAuth.adAccountIds': adAccountIds,
        ...(adAccounts ? { 'metaAuth.adAccounts': adAccounts } : {}),
      },
      { new: true }
    );

    if (!user) throw new Error('User not found');
    return user;
  }
}

export const authService = new AuthService();
