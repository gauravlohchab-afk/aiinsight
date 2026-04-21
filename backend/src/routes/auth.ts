import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authService } from '../services/AuthService';
import { metaService } from '../services/MetaService';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { validateRequest, asyncHandler, AppError } from '../middleware/errorHandler';
import { enqueueSyncJob } from '../workers/syncWorker';
import { User } from '../models/User';
import crypto from 'crypto';

const router = Router();

// Register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('name').notEmpty(),
    validateRequest,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, name } = req.body;
    const { user, tokens } = await authService.register(email, password, name);

    res.status(201).json({
      success: true,
      data: { user, ...tokens },
    });
  })
);

// Login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    validateRequest,
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const { user, tokens } = await authService.login(email, password);
    
    res.json({ success: true, data: { user, ...tokens } });
  })
);

router.post(
  '/refresh',
  [body('refreshToken').notEmpty(), validateRequest],
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    const tokenData = await authService.refreshAccessToken(refreshToken);

    // Echo back the same refresh token so the client doesn't overwrite it with undefined
    res.json({
      success: true,
      data: { ...tokenData, refreshToken },
    });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?._id) {
      throw new AppError('User not authenticated', 401);
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      success: true,
      data: user,
    });
  })
);

// Meta Connect
router.get(
  '/meta/connect',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {

    if (!req.user || !req.user._id) {
      throw new AppError('User not authenticated', 401);
    }

    const state = `${req.user._id}_${crypto.randomBytes(8).toString('hex')}`;
    const url = metaService.getOAuthUrl(state);

    res.json({ success: true, data: { url } });
  })
);

router.get(
  '/meta/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const { code, error, state } = req.query;

    if (error) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/settings?meta_error=${encodeURIComponent(error as string)}`
      );
    }

    if (!code) throw new AppError('Authorization code missing', 400);

    // ✅ FIXED VALIDATION
    if (!state || !(state as string).includes('_')) {
      throw new AppError('Invalid state', 400);
    }

    const userId = (state as string).split('_')[0];

    if (!userId || userId === 'undefined') {
      throw new AppError('Invalid user in state', 400);
    }

    const tokenData = await metaService.exchangeCodeForToken(code as string);
    const longLived = await metaService.getLongLivedToken(tokenData.accessToken);

    const adAccounts = await metaService.getAdAccounts(longLived.accessToken);
    const adAccountIds = adAccounts.map((a: any) => a.id);
    const adAccountsWithNames = adAccounts.map((a: any) => ({ id: a.id, name: a.name || a.id }));

    const user = await authService.handleMetaCallback(
      userId,
      longLived.accessToken,
      longLived.expiresIn,
      tokenData.userId,
      adAccountIds,
      adAccountsWithNames
    );

    for (const adAccountId of adAccountIds) {
      await enqueueSyncJob(user._id.toString(), adAccountId, 'full_sync');
    }

    res.redirect(`${process.env.FRONTEND_URL}/settings?meta_connected=true`);
  })
);

export default router;