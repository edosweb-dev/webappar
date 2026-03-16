import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.mattonflex.it',
        pathname: '/textures/**',
      },
      {
        protocol: 'https',
        hostname: 'mattonflex.it',
        pathname: '/wp-content/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
    ],
  },
};

export default nextConfig;
