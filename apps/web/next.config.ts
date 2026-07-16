import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// ESM-safe __dirname equivalent (this file has no CJS __dirname).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Workspace root (repo root, two levels up from apps/web) — REQUIRED in a
// pnpm monorepo so `next build`'s output-file-tracing walks up past
// apps/web and picks up the symlinked @docjob/* workspace packages instead
// of stopping at the first lockfile-less directory it finds.
const workspaceRoot = path.join(__dirname, '../../');

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
