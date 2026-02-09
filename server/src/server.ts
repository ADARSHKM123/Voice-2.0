import app from './app';
import { config } from './config';
import { connectDatabase } from './shared/database/connection';
import { logger } from './shared/utils/logger';
import { runMigrations } from './shared/database/migrate';

async function start(): Promise<void> {
  try {
    // Connect to database
    await connectDatabase();

    // Run migrations
    await runMigrations();

    // Start server
    app.listen(config.port, '0.0.0.0', () => {
      logger.info(`Server running on 0.0.0.0:${config.port} in ${config.nodeEnv} mode`);
    });
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
