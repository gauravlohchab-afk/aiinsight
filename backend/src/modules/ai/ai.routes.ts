import { Router } from 'express';
import { body, query } from 'express-validator';
import { authenticate } from '../../middleware/auth';
import { asyncHandler, validateRequest } from '../../middleware/errorHandler';
import { aiController } from './ai.controller';

const router = Router();

router.use(authenticate);

router.post(
  '/analyze-audience',
  [body('adAccountId').notEmpty(), validateRequest],
  asyncHandler(aiController.analyzeAudience.bind(aiController))
);

router.post(
  '/performance-review',
  [body('adAccountId').notEmpty(), validateRequest],
  asyncHandler(aiController.performanceReview.bind(aiController))
);

router.post(
  '/analyze-creatives',
  [body('adAccountId').notEmpty(), validateRequest],
  asyncHandler(aiController.analyzeCreatives.bind(aiController))
);

router.post(
  '/optimize-budget',
  [body('adAccountId').notEmpty(), body('totalBudget').isFloat({ min: 1 }), validateRequest],
  asyncHandler(aiController.optimizeBudget.bind(aiController))
);

router.get(
  '/history',
  [query('limit').optional().isInt({ min: 1, max: 100 }), validateRequest],
  asyncHandler(aiController.history.bind(aiController))
);

router.post(
  '/improvements',
  [body('adAccountId').optional().isString(), validateRequest],
  asyncHandler(aiController.improvements.bind(aiController))
);

export default router;
