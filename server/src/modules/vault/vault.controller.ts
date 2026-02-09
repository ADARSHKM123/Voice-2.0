import { Response, NextFunction } from 'express';
import * as vaultService from './vault.service';
import { AuthenticatedRequest } from '../../shared/types';
import { success, error } from '../../shared/utils/response';

export async function getEntries(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const entries = await vaultService.getEntries(req.user!.userId);
    success(res, entries);
  } catch (err) {
    next(err);
  }
}

export async function createEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const entry = await vaultService.createEntry({
      userId: req.user!.userId,
      encryptedData: req.body.encryptedData,
      iv: req.body.iv,
      tag: req.body.tag,
      category: req.body.category || 'password',
    });
    success(res, entry, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const entryId = req.params.id as string;
    const entry = await vaultService.updateEntry(entryId, req.user!.userId, {
      encryptedData: req.body.encryptedData,
      iv: req.body.iv,
      tag: req.body.tag,
      category: req.body.category,
    });

    if (!entry) {
      error(res, 'Entry not found', 404);
      return;
    }

    success(res, entry);
  } catch (err) {
    next(err);
  }
}

export async function deleteEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const entryId = req.params.id as string;
    const deleted = await vaultService.deleteEntry(entryId, req.user!.userId);
    if (!deleted) {
      error(res, 'Entry not found', 404);
      return;
    }
    success(res, { message: 'Entry deleted' });
  } catch (err) {
    next(err);
  }
}
