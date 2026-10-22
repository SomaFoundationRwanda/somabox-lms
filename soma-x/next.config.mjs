import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    // The e2e suite builds into its own folder so it never clobbers a running dev server.
    distDir: process.env.NEXT_DIST_DIR || '.next',
    allowedDevOrigins: ['*'],
    outputFileTracingRoot: path.join(__dirname, '../'),
    // Workspace package shared with the backend (plain ESM source).
    transpilePackages: ['@somabox/timeline'],
};

export default nextConfig;
