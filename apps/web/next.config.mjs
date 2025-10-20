/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb'
    }
  },
  transpilePackages: ['@patchbay/messaging-fake', '@patchbay/messaging-twilio']
}

export default nextConfig


