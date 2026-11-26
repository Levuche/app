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
  // @levuche/kit and @levuche/ui ship TypeScript source
  // (github.com/Levuche/kit, github.com/Levuche/ui).
  transpilePackages: ['@levuche/kit', '@levuche/ui'],
  experimental: {
    // unauthorized() and src/app/unauthorized.tsx: a signed-out visitor gets
    // the sign-in screen, with a 401, in place of anything a page renders
    // (src/lib/buildbase.ts, requireUser).
    authInterrupts: true,
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Private draft previews (#21): never indexed or kept by a cache.
      {
        source: '/draft/:token',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default nextConfig;

// Gives `next dev` the Cloudflare bindings from wrangler.jsonc.
initOpenNextCloudflareForDev();
