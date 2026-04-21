import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { User } from '../models/User';
import { metaService } from '../services/MetaService';

const router = Router();

router.use(authenticate);

router.get(
  '/accounts',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = await User.findById(req.user!._id).select('+metaAuth.accessToken');

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const storedAccounts = (user.metaAuth?.adAccounts || []).map((account) => ({
      id: account.id,
      name: account.name || account.id,
      currency: (account as any).currency || 'USD',
    }));

    if (!user.metaAuth?.accessToken) {
      return res.json({
        success: true,
        data: storedAccounts,
      });
    }

    try {
      const liveAccounts = await metaService.getAdAccounts(user.metaAuth.accessToken);
      const normalizedAccounts = liveAccounts.map((account) => ({
        id: account.id,
        name: account.name || account.id,
        currency: account.currency || 'USD',
      }));

      await User.findByIdAndUpdate(user._id, {
        'metaAuth.adAccountIds': normalizedAccounts.map((account) => account.id),
        'metaAuth.adAccounts': normalizedAccounts,
      });

      return res.json({
        success: true,
        data: normalizedAccounts,
      });
    } catch (error) {
      if (storedAccounts.length > 0) {
        return res.json({
          success: true,
          data: storedAccounts,
        });
      }

      throw new AppError('Failed to fetch Meta ad accounts', 502);
    }
  })
);

export default router;