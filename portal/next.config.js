/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Proxy API calls through the portal's own origin so the browser only ever
  // talks to the portal host (works identically on localhost and on the VPS
  // public IP). This avoids CORS, the Chrome private-network/loopback block,
  // and the need to expose the API port (3000) through the firewall.
  // The rewrite runs server-side in the Next.js container and forwards to the
  // 'api' service over the Docker network.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET || 'http://api:3000'
    return [
      { source: '/v1/:path*', destination: `${target}/v1/:path*` },
    ]
  },
}
module.exports = nextConfig
