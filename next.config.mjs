/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  allowedDevOrigins: [
    '172.17.240.193',
    'localhost',
    '127.0.0.1',
    '172.17.*',
    '*.local',
  ],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
