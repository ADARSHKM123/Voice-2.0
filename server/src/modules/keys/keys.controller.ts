import { Response, NextFunction } from 'express';
import * as keysService from './keys.service';
import { AuthenticatedRequest } from '../../shared/types';
import { success, error } from '../../shared/utils/response';

export async function getKeyParams(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = await keysService.getKeyParams(req.user!.userId);
    if (!params) {
      error(res, 'Key parameters not found', 404);
      return;
    }
    success(res, params);
  } catch (err) {
    next(err);
  }
}
