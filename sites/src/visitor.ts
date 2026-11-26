// What a creator site sends with every page, and what it tells about the
// visitor's browser (#23). No React here, so it's tested on its own.

/**
 * The browser built into a social app (Instagram, Facebook, TikTok and the
 * like), where links from a bio open. Those browsers keep the visitor
 * inside the app, with no address bar, so the page offers its own way out.
 * Null for any other browser.
 */
export function inAppBrowser(
  userAgent: string | null
): 'android' | 'ios' | null {
  const ua = userAgent ?? '';
  const inApp =
    /\b(Instagram|FBAN|FBAV|FB_IAB|FBIOS|musical_ly|BytedanceWebview|TikTok|Snapchat|LinkedInApp|Pinterest|Line\/|Threads)\b/i.test(
      ua
    );
  if (!inApp) return null;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return null;
}

/**
 * An address that asks Android to open the page in the phone's own
 * browser, falling back to the page itself.
 */
export function androidOpenUrl(pageUrl: string) {
  const url = new URL(pageUrl);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
}

/**
 * Headers for every answer from a creator site. The page runs no scripts
 * and loads nothing but its pictures and videos from https addresses, so a
 * creator's words can never become code. Nothing from the Levuche app
 * reaches it: levuche.page is a site of its own, so the app's session
 * cookie (levuche.com) is never sent here, and nothing here sets one.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    'img-src https: data:',
    'media-src https:',
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; '),
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site',
};

export interface SitemapPage {
  path: string;
  hidden: boolean;
}

/** robots.txt: a live site can be crawled, with its sitemap; any other address can't. */
export function robotsTxt(base: string | null) {
  return base
    ? `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n';
}

/** sitemap.xml: a live site's pages, leaving out the ones kept to their link (hidden). */
export function sitemapXml(
  base: string,
  pages: SitemapPage[],
  lastModified: string
) {
  const escape = (text: string) =>
    text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const urls = pages
    .filter((page) => !page.hidden)
    .map(
      (page) =>
        `  <url><loc>${escape(page.path ? `${base}/${page.path}` : `${base}/`)}</loc><lastmod>${escape(lastModified)}</lastmod></url>`
    );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
