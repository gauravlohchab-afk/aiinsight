import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { aiOrchestrationService } from './ai.service';

export class AIController {
  async analyzeAudience(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = aiOrchestrationService.toObjectId(req.user?._id);
    const { adAccountId, audienceDefinition, campaignIds } = req.body;
    const result = await aiOrchestrationService.analyzeAudience({
      userId,
      adAccountId,
      audienceDefinition,
      campaignIds,
    });

    res.json({ success: true, data: result });
  }

  async performanceReview(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = aiOrchestrationService.toObjectId(req.user?._id);
    const { adAccountId } = req.body;
    const result = await aiOrchestrationService.generatePerformanceReview({ userId, adAccountId });
    res.json({ success: true, data: result });
  }

  async analyzeCreatives(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = aiOrchestrationService.toObjectId(req.user?._id);
    const { adAccountId } = req.body;
    const result = await aiOrchestrationService.analyzeCreatives({ userId, adAccountId });
    res.json({ success: true, data: result });
  }

  async optimizeBudget(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = aiOrchestrationService.toObjectId(req.user?._id);
    const { adAccountId, totalBudget } = req.body;
    const result = await aiOrchestrationService.optimizeBudget({ userId, adAccountId, totalBudget });
    res.json({ success: true, data: result });
  }

  async history(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = aiOrchestrationService.toObjectId(req.user?._id);
    const limit = Number(req.query.limit || 20);
    const result = await aiOrchestrationService.getHistory({ userId, limit });
    res.json({ success: true, data: result });
  }

  async improvements(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = aiOrchestrationService.toObjectId(req.user?._id);
    const { adAccountId, campaignId, adsetId, metrics } = req.body;
    const result = await aiOrchestrationService.generateImprovements({
      userId,
      adAccountId,
      campaignId,
      adsetId,
      metrics,
    });

    res.json({ success: true, data: result });
  }
}

export const aiController = new AIController();
