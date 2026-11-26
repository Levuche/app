import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

/** Only app.levuche.com enforces the policy; app-dev and previews report. */
const isProductionApp =
  (process.env.NEXT_PUBLIC_APP_URL?.trim() || '').replace(/\/+$/, '') ===
  'https://app.levuche.com';

/** The Buildbase API: sign-in, workspaces, and the account and team screens. */
const buildbaseApi = new URL(
  process.env.NEXT_PUBLIC_BUILDBASE_SERVER_URL?.trim() ||
    'https://api.console.buildbase.app'
).origin;

/**
 * Stripe's card fields, which Buildbase's billing screens put on the page
 * when a creator adds or changes how they pay.
 */
const stripe = {
  script: 'https://js.stripe.com',
  frame: 'https://js.stripe.com https://hooks.stripe.com',
  connect: 'https://api.stripe.com',
};

/**
 * The Content-Security-Policy: only the hosts the app needs. Next.js and
 * next-themes put small scripts and styles inline, and Buildbase's screens
 * style themselves inline, so those stay allowed. Creators' pictures and
 * profile pictures can be any https image. A YouTube block plays from
 * youtube-nocookie.com once a visitor presses play. Sign-in and Buildbase's
 * checkout are full-page redirects and need no entry.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${stripe.script}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${buildbaseApi} ${stripe.connect}`,
  `frame-src 'self' https://www.youtube-nocookie.com ${stripe.frame}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Where browsers report what the policy blocks (src/app/api/csp-report).
  // report-to is the current way; report-uri is for browsers without it.
  'report-uri /api/csp-report',
  'report-to csp',
].join('; ');

/**
 * The app is for signed-in creators, so no host is ever indexed, and pages
 * can't be framed by other sites. app-dev, previews and `next dev` send the
 * policy as report-only, so a host it misses shows in the browser console
 * and the Worker's logs instead of breaking a screen; app.levuche.com
 * enforces it.
 */
const enforceCsp = isProductionApp && process.env.NODE_ENV === 'production';
const securityHeaders = [
  {
    key: enforceCsp
      ? 'Content-Security-Policy'
      : 'Content-Security-Policy-Report-Only',
    value: contentSecurityPolicy,
  },
  // The `csp` endpoint the policy's report-to names.
  { key: 'Reporting-Endpoints', value: 'csp="/api/csp-report"' },
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
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;

// Gives `next dev` the Cloudflare bindings from wrangler.jsonc.
initOpenNextCloudflareForDev();
