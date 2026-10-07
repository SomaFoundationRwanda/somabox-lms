import { config } from './src/config/index.js';
import { initSchemas } from './src/helpers/db-manager.js';
import { hydrateCaches } from './src/data/cache/index.js';
import { createApp } from './src/app.js';
import { recoverJobs } from './src/services/ai/jobs.js';
import { scheduleUsagePurge } from './src/services/analytics.services.js';

// Schema and migrations must be applied before any request is served.
await initSchemas();
await hydrateCaches();
// AI jobs that were running when the server stopped can't resume: mark them failed.
await recoverJobs();
scheduleUsagePurge();

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
