// Which creator site a request is for (#23). In production each site has
// its own address, <handle>.levuche.page. The dev Worker answers on one
// levuche.com address with the handle as the first part of the path
// (sites-dev.levuche.com/<handle>), because a wildcard of levuche.page is
// for production only. No Next.js or React here, so it's tested on its own.
import { isHandle } from '../../src/lib/handle.ts';

export interface SitesConfig {
  /** The domain whose subdomains are sites: levuche.page. */
  SITES_DOMAIN?: string;
  /** A single host that takes the handle from the path, for dev. */
  SITES_PATH_HOST?: string;
}

export interface Located {
  handle: string;
  /** The page's path inside the site: '' for the home page, no slashes around it. */
  path: string;
  /** The site's own address, with no trailing slash. */
  base: string;
}

export const DEFAULT_DOMAIN = 'levuche.page';

/**
 * The site and page a URL asks for, or null when it isn't a site address.
 * Handles are lowercase, so an address in capitals is read in lowercase
 * (browsers lowercase hosts anyway).
 */
export function locate(url: URL, config: SitesConfig): Located | null {
  const host = url.hostname.toLowerCase();
  const domain = (config.SITES_DOMAIN || DEFAULT_DOMAIN).toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);

  if (config.SITES_PATH_HOST && host === config.SITES_PATH_HOST.toLowerCase()) {
    const [first = '', ...rest] = parts;
    const handle = safeDecode(first).toLowerCase();
    if (!isHandle(handle)) return null;
    return {
      handle,
      path: pagePath(rest),
      base: `https://${host}/${handle}`,
    };
  }

  if (!host.endsWith(`.${domain}`)) return null;
  const handle = host.slice(0, -domain.length - 1);
  if (!isHandle(handle)) return null;
  return { handle, path: pagePath(parts), base: `https://${host}` };
}

/** The bare domain and www, which belong to Levuche itself, not a site. */
export function isApex(url: URL, config: SitesConfig) {
  const host = url.hostname.toLowerCase();
  const domain = (config.SITES_DOMAIN || DEFAULT_DOMAIN).toLowerCase();
  return host === domain || host === `www.${domain}`;
}

function pagePath(parts: string[]) {
  return parts
    .map((part) => safeDecode(part).toLowerCase())
    .join('/')
    .slice(0, 200);
}

function safeDecode(part: string) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}
