import { z } from 'zod';

export const createEntrySchema = z.object({
  encryptedData: z.string().min(1, 'Encrypted data is required'),
  iv: z.string().min(1, 'IV is required'),
  tag: z.string().min(1, 'Auth tag is required'),
  category: z.enum(['password', 'note', 'card']).default('password'),
});

export const updateEntrySchema = z.object({
  encryptedData: z.string().min(1, 'Encrypted data is required'),
  iv: z.string().min(1, 'IV is required'),
  tag: z.string().min(1, 'Auth tag is required'),
  category: z.enum(['password', 'note', 'card']).optional(),
});
