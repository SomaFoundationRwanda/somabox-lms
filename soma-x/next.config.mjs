import path from 'path';
import { fileURLToPath } from 'url';
import somabox from '@somabox/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The repository's single .env (see .env.example). Only these public values are built into the
// frontend; everything else in the .env (database password, sync keys) stays on the server.
const settings = somabox.readConfig();

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    // The e2e suite builds into its own folder so it never clobbers a running dev server.
    distDir: process.env.NEXT_DIST_DIR || '.next',
    allowedDevOrigins: ['*'],
    outputFileTracingRoot: path.join(__dirname, '../'),
    // Workspace package shared with the backend (plain ESM source).
    transpilePackages: ['@somabox/timeline'],
    env: {
        NEXT_PUBLIC_SERVER_URL: settings.serverUrl,
        NEXT_PUBLIC_FEATURE_SOL_QUIZ_ENABLED: String(settings.NEXT_PUBLIC_FEATURE_SOL_QUIZ_ENABLED),
    },
};

export default nextConfig;
