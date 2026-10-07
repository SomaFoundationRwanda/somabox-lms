import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    allowedDevOrigins: ['*'],
    outputFileTracingRoot: path.join(__dirname, '../'),
    // Workspace package shared with the backend (plain ESM source).
    transpilePackages: ['@somabox/timeline'],
};

export default nextConfig;
