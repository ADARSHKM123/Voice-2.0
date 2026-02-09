import { Pool } from 'pg';
import { config } from '../../config';
import { logger } from '../utils/logger';

export const pool = new Pool({
  connectionString: config.database.url,
  min: config.database.poolMin,
  max: config.database.poolMax,
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', err);
});

export async function connectDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
    logger.info('Database connected successfully');
  } finally {
    client.release();
  }
}

export async function closeDatabasePool(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}
