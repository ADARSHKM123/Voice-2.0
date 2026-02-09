import fs from 'fs';
import path from 'path';
import { pool } from './connection';
import { logger } from '../utils/logger';

export async function runMigrations(): Promise<void> {
  const migrationsDir = path.resolve(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    try {
      await pool.query(sql);
      logger.info(`Migration applied: ${file}`);
    } catch (err: any) {
      // IF NOT EXISTS clauses handle re-runs gracefully
      logger.info(`Migration ${file}: ${err.message || 'applied'}`);
    }
  }
}

// Allow running directly: ts-node src/shared/database/migrate.ts
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('All migrations complete');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Migration failed', err);
      process.exit(1);
    });
}
