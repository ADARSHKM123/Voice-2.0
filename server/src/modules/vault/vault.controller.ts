import { Response, NextFunction } from 'express';
import * as vaultService from './vault.service';
import { AuthenticatedRequest } from '../../shared/types';
import { success, error } from '../../shared/utils/response';
import { logger } from '../../shared/utils/logger';

export async function getEntries(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    logger.info('[VaultCtrl] getEntries request', { userId });
    const entries = await vaultService.getEntries(userId);
    logger.info('[VaultCtrl] getEntries response', { userId, count: entries.length });
    success(res, entries);
  } catch (err) {
    next(err);
  }
}

export async function createEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    logger.info('[VaultCtrl] createEntry request', { userId, category: req.body.category || 'password' });
    const entry = await vaultService.createEntry({
      userId,
      encryptedData: req.body.encryptedData,
      iv: req.body.iv,
      tag: req.body.tag,
      category: req.body.category || 'password',
    });
    logger.info('[VaultCtrl] createEntry success', { userId, entryId: entry.id });
    success(res, entry, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const entryId = req.params.id as string;
    const userId = req.user!.userId;
    logger.info('[VaultCtrl] updateEntry request', { entryId, userId });
    const entry = await vaultService.updateEntry(entryId, userId, {
      encryptedData: req.body.encryptedData,
      iv: req.body.iv,
      tag: req.body.tag,
      category: req.body.category,
    });

    if (!entry) {
      logger.warn('[VaultCtrl] updateEntry: not found', { entryId, userId });
      error(res, 'Entry not found', 404);
      return;
    }

    logger.info('[VaultCtrl] updateEntry success', { entryId, userId });
    success(res, entry);
  } catch (err) {
    next(err);
  }
}

export async function deleteEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const entryId = req.params.id as string;
    const userId = req.user!.userId;
    logger.info('[VaultCtrl] deleteEntry request', { entryId, userId });
    const deleted = await vaultService.deleteEntry(entryId, userId);
    if (!deleted) {
      logger.warn('[VaultCtrl] deleteEntry: not found', { entryId, userId });
      error(res, 'Entry not found', 404);
      return;
    }
    logger.info('[VaultCtrl] deleteEntry success', { entryId, userId });
    success(res, { message: 'Entry deleted' });
  } catch (err) {
    next(err);
  }
}
