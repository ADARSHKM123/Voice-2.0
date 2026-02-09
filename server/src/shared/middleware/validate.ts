import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.errors.map((e) => e.message).join(', ');
        res.status(400).json({
          success: false,
          error: `Validation failed: ${messages}`,
        });
        return;
      }
      next(err);
    }
  };
}
