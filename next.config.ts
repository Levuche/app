import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

/**
 * The app is for signed-in creators, so no host is ever indexed, and pages
 * can't be framed by other sites. A Content-Security-Policy comes with
 * sign-in, once the Buildbase hosts it needs are known.
 */
const securityHeaders = [
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
];

const nextConfig: NextConfig = {
  // No `x-powered-by: Next.js` header.
  poweredByHeader: false,
  // @levuche/kit ships TypeScript source (github.com/Levuche/kit).
  transpilePackages: ['@levuche/kit'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;

// Gives `next dev` the Cloudflare bindings from wrangler.jsonc.
initOpenNextCloudflareForDev();
