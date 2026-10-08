import { config } from './src/config/index.js';
import { initSchemas } from './src/helpers/db-manager.js';
import { startExploreIndexer } from './src/services/explore/indexer.js';
import { recoverSummaries } from './src/services/explore/summaries.js';
import { createApp } from './src/app.js';
import { recoverJobs } from './src/services/ai/jobs.js';
import { scheduleUsagePurge } from './src/services/analytics.services.js';
import { scheduleSync } from './src/services/sync/outbox.js';

// Schema and migrations must be applied before any request is served.
await initSchemas();
// AI jobs that were running when the server stopped can't resume: mark them failed.
await recoverJobs();
scheduleUsagePurge();
// Explore follows the files on disk: index now (in the background) and every few minutes.
startExploreIndexer();
// AI summaries that were being made when the server stopped start again.
recoverSummaries().catch((error) => console.error('Summary recovery failed:', error.message));
// Box-to-cloud sync runs on a schedule (SYNC_INTERVAL_MINUTES), never at login.
scheduleSync();

const app = createApp();

// Server Start
app.listen(config.port)
  .on('listening', () => console.log(`Server running on port ${config.port}`))
  .on('error', err => {
      if (err.code === 'EADDRINUSE') {
          console.error(`Port ${config.port} is already in use`);
          process.exit(1);
      } else {
          throw err;
      }
  });
