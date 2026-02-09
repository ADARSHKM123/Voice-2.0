import { Router } from 'express';
import * as vaultController from './vault.controller';
import { authenticate } from '../auth/auth.middleware';
import { validate } from '../../shared/middleware/validate';
import { createEntrySchema, updateEntrySchema } from './vault.validation';

const router = Router();

router.use(authenticate);

router.get('/entries', vaultController.getEntries);
router.post('/entries', validate(createEntrySchema), vaultController.createEntry);
router.put('/entries/:id', validate(updateEntrySchema), vaultController.updateEntry);
router.delete('/entries/:id', vaultController.deleteEntry);

export default router;
