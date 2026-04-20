import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  typescript: {
    // Flip to true only in an emergency; the chat feature adds a lot of
    // typed surface and regressions here are cheap to catch at build time.
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
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

export default nextConfig;
