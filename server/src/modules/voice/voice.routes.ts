import { Router } from 'express';
import * as voiceController from './voice.controller';
import { authenticate } from '../auth/auth.middleware';
import { validate } from '../../shared/middleware/validate';
import { z } from 'zod';

const transcriptSchema = z.object({
  transcript: z.string().min(1, 'Transcript is required').max(1000, 'Transcript too long'),
});

const router = Router();

router.post('/process', authenticate, validate(transcriptSchema), voiceController.processVoice);
router.get('/elevenlabs-session', authenticate, voiceController.getElevenLabsSession);

export default router;
