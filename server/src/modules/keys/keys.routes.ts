import { Router } from 'express';
import * as keysController from './keys.controller';
import { authenticate } from '../auth/auth.middleware';

const router = Router();

router.get('/params', authenticate, keysController.getKeyParams);

export default router;
