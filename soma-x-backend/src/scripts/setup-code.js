// `pnpm setup:code`, run on the box: prints a new one-time code. Without an admin it sets up the
// box (valid 24 hours); with admins it recovers admin access (valid 1 hour). Earlier codes stop working.
import { initSchemas, pool } from '../helpers/db-manager.js';
import { issueSetupCode, printSetupCode } from '../services/setup.services.js';

await initSchemas();
printSetupCode(await issueSetupCode());
await pool.end();
