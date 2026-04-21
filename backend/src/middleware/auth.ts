import { NextFunction, Request, RequestHandler, Response } from 'express';
import { authService } from '../services/AuthService';

declare global {
  namespace Express {
    interface User {
      _id: string;
    }

    interface Request {
      user?: User;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user?: Express.User;
}

export const authenticate: RequestHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) : void => {
  try {
    const authHeader = req.headers.authorization;

    console.log('🔐 [Auth Middleware]', {
      path: req.path,
      method: req.method,
      hasToken: !!authHeader,
    });

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ [Auth Middleware] No Bearer token found in Authorization header');
      res.status(401).json({
        success: false,
        message: 'Access token required',
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = authService.verifyAccessToken(token);

    if (!decoded.userId) {
      console.error('❌ [Auth Middleware] Invalid token payload - no userId');
      res.status(401).json({
        success: false,
        message: 'Invalid token payload',
      });
      return;
    }

    req.user = {
      _id: decoded.userId,
    };

    console.log('✅ [Auth Middleware] Token verified', {
      userId: decoded.userId,
      email: decoded.email,
    });

    next();
  } catch (error: any) {
    console.error('❌ [Auth Middleware] Token verification failed', {
      error: error.message,
      name: error.name,
    });
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
    return;
  }
};