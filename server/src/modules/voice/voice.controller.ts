import { Response, NextFunction } from 'express';
import * as voiceService from './voice.service';
import { AuthenticatedRequest } from '../../shared/types';
import { success } from '../../shared/utils/response';

export async function processVoice(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { transcript } = req.body;
    const intent = await voiceService.processTranscript(transcript);
    success(res, { intent, transcript });
  } catch (err) {
    next(err);
  }
}
