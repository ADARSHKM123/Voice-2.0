import { Router } from 'express';
import * as authController from './auth.controller';
import { validate } from '../../shared/middleware/validate';
import { registerSchema, loginSchema, refreshSchema, logoutSchema } from './auth.validation';
import { authLimiter } from '../../shared/middleware/rateLimiter';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshSchema), authController.refresh);
router.post('/logout', validate(logoutSchema), authController.logout);

export default router;
