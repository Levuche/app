// How the sites Worker answers a request (#23): which site and page it's
// for, what state the site is in, and the page itself, cached by version so
// publishing or making another version live shows at once. Drawing the HTML
// is left to a Renderer (sites/src/render.tsx), so this file has no React
// and is tested on its own (sites/src/serve.test.ts).
import type { D1Database } from '@cloudflare/workers-types';
import type {
  PageSnapshot,
  SiteSnapshot,
  SiteStatus,
} from '../../src/lib/db.ts';
import { RESERVED_HANDLES } from '../../src/lib/handle.ts';
import { isApex, locate, type Located, type SitesConfig } from './locate.ts';
import {
  inAppBrowser,
  robotsTxt,
  SECURITY_HEADERS,
  sitemapXml,
} from './visitor.ts';

export interface SitesEnv extends SitesConfig {
  DB: D1Database;
  /** "true" on the dev Worker: nothing it serves is ever indexed. */
  SITES_NOINDEX?: string;
  /** Changes with each deploy, so cached pages from an older build aren't used. */
  BUILD_ID?: string;
  /** The app, for links to make a site and to report one. */
  APP_URL?: string;
}

const DEFAULT_APP = 'https://app.levuche.com';

/** Why a site address has no page to show. */
export type Missing =
  /** Nobody has this handle. */
  | 'free'
  /** A handle Levuche keeps back. */
  | 'none'
  /** Made, but never published. */
  | 'not-live'
  /** Taken offline by its creator. */
  | 'offline'
  /** Paused by the Levuche team. */
  | 'paused'
  /** The site was deleted. */
  | 'removed'
  /** The site is live, but has no page at this path. */
  | 'no-page'
  /** Something broke while answering. */
  | 'error';

export type InApp = ReturnType<typeof inAppBrowser>;

export interface Renderer {
  page(input: {
    site: Located;
    page: PageSnapshot;
    snapshot: SiteSnapshot;
    inApp: InApp;
    url: string;
    app: string;
  }): string | Promise<string>;
  /** levuche.page itself: what Levuche is, and where to start. */
  intro(input: {
    inApp: InApp;
    url: string;
    app: string;
  }): string | Promise<string>;
  missing(input: {
    why: Missing;
    site: Located;
    inApp: InApp;
    url: string;
    app: string;
  }): string | Promise<string>;
}

type SiteState =
  | { kind: 'free' | 'none' | 'removed' }
  | {
      kind: 'site';
      siteId: string;
      status: SiteStatus;
      liveVersion: number | null;
      publishedAt: string | null;
    };

/** A handle's site and its state, in one read. */
export async function findSite(
  db: D1Database,
  handle: string
): Promise<SiteState> {
  const row = await db
    .prepare(
      `SELECT h.kind, h.site_id AS siteId, s.status, s.live_version AS liveVersion,
         (SELECT v.published_at FROM versions v
          WHERE v.site_id = s.id AND v.number = s.live_version) AS publishedAt
       FROM handles h LEFT JOIN sites s ON s.id = h.site_id
       WHERE h.handle = ?1`
    )
    .bind(handle)
    .first<{
      kind: 'site' | 'held' | 'reserved';
      siteId: string | null;
      status: SiteStatus | null;
      liveVersion: number | null;
      publishedAt: string | null;
    }>();
  // Names kept for Levuche in code can't be claimed, so they aren't free.
  if (!row) return { kind: RESERVED_HANDLES.has(handle) ? 'none' : 'free' };
  if (row.kind === 'reserved') return { kind: 'none' };
  if (row.kind === 'held' || !row.siteId || !row.status)
    return { kind: 'removed' };
  return {
    kind: 'site',
    siteId: row.siteId,
    status: row.status,
    liveVersion: row.liveVersion,
    publishedAt: row.publishedAt,
  };
}

/** A published version's snapshot. */
export async function versionSnapshot(
  db: D1Database,
  siteId: string,
  number: number
) {
  const row = await db
    .prepare('SELECT snapshot FROM versions WHERE site_id = ?1 AND number = ?2')
    .bind(siteId, number)
    .first<{ snapshot: string }>();
  return row ? (JSON.parse(row.snapshot) as SiteSnapshot) : null;
}

const MISSING_STATUS: Record<Missing, number> = {
  free: 404,
  none: 404,
  'not-live': 404,
  offline: 404,
  paused: 404,
  removed: 410,
  'no-page': 404,
  error: 500,
};

function headers(
  env: SitesEnv,
  type: string,
  extra: Record<string, string> = {}
) {
  const all = new Headers({
    ...SECURITY_HEADERS,
    'Content-Type': type,
    ...extra,
  });
  if (env.SITES_NOINDEX === 'true')
    all.set('X-Robots-Tag', 'noindex, nofollow');
  return all;
}

const NO_CACHE = { 'Cache-Control': 'no-store' };

const appUrl = (env: SitesEnv) =>
  (env.APP_URL || DEFAULT_APP).replace(/\/+$/, '');

/**
 * Where Levuche's own intro lives, when this request is for it: the bare
 * domain, www, or the dev host's root. Null for a site address.
 */
function introHome(url: URL, env: SitesEnv): string | null {
  const domain = (env.SITES_DOMAIN || 'levuche.page').toLowerCase();
  if (isApex(url, env)) return `https://${domain}/`;
  const pathHost = env.SITES_PATH_HOST?.toLowerCase();
  if (
    pathHost &&
    url.hostname.toLowerCase() === pathHost &&
    url.pathname === '/'
  )
    return `https://${pathHost}/`;
  return null;
}

/** A request that isn't for any one site, for the pages that say so. */
const nowhere = (url: URL): Located => ({
  handle: '',
  path: '',
  base: url.origin,
});

/**
 * The page a visitor sees when answering failed: drawn like the other
 * Levuche pages, with plain text only if drawing it fails too.
 */
export async function failed(
  request: Request,
  env: SitesEnv,
  render: Renderer
): Promise<Response> {
  const extra = { ...NO_CACHE, 'X-Robots-Tag': 'noindex, nofollow' };
  const head = request.method === 'HEAD';
  try {
    const url = new URL(request.url);
    const html = await render.missing({
      why: 'error',
      site: nowhere(url),
      inApp: inAppBrowser(request.headers.get('User-Agent')),
      url: url.href,
      app: appUrl(env),
    });
    return new Response(head ? null : html, {
      status: 500,
      headers: headers(env, 'text/html; charset=utf-8', extra),
    });
  } catch {
    return new Response(
      head ? null : 'Something went wrong. Try again in a moment.',
      { status: 500, headers: headers(env, 'text/plain; charset=utf-8', extra) }
    );
  }
}

/** The answer to one request to the sites Worker. */
export async function serve(
  request: Request,
  env: SitesEnv,
  render: Renderer,
  cache?: Cache
): Promise<Response> {
  const head = request.method === 'HEAD';
  if (request.method !== 'GET' && !head)
    return new Response(null, {
      status: 405,
      headers: headers(env, 'text/plain', { Allow: 'GET, HEAD' }),
    });
  const answer = (body: string | null, status: number, init: Headers) =>
    new Response(head ? null : body, { status, headers: init });

  const url = new URL(request.url);
  const noindex = env.SITES_NOINDEX === 'true';
  const inApp = inAppBrowser(request.headers.get('User-Agent'));
  const app = appUrl(env);

  // levuche.page itself (and the dev host's root) introduces Levuche, with
  // a way to start and a way to read more. www and any other path go to it.
  const home = introHome(url, env);
  if (home) {
    if (url.pathname === '/robots.txt')
      return answer(
        robotsTxt(null),
        200,
        headers(env, 'text/plain; charset=utf-8')
      );
    const target = new URL(home);
    if (url.host !== target.host || url.pathname !== '/')
      return Response.redirect(home, 301);
    return answer(
      await render.intro({ inApp, url: home, app }),
      200,
      headers(env, 'text/html; charset=utf-8', {
        'Cache-Control': 'public, max-age=300',
        Vary: 'User-Agent',
      })
    );
  }
  const site = locate(url, env);
  if (!site) {
    if (url.pathname === '/robots.txt')
      return answer(
        robotsTxt(null),
        200,
        headers(env, 'text/plain; charset=utf-8')
      );
    // An address no handle could have (too short, two levels deep): the
    // same page as a name kept back, rather than bare text.
    return answer(
      await render.missing({
        why: 'none',
        site: nowhere(url),
        inApp,
        url: url.href,
        app,
      }),
      404,
      headers(env, 'text/html; charset=utf-8', {
        ...NO_CACHE,
        'X-Robots-Tag': 'noindex, nofollow',
      })
    );
  }

  const state = await findSite(env.DB, site.handle);
  const live =
    state.kind === 'site' &&
    state.status === 'live' &&
    state.liveVersion !== null
      ? state
      : null;

  if (site.path === 'robots.txt')
    return answer(
      robotsTxt(live && !noindex ? site.base : null),
      200,
      headers(env, 'text/plain; charset=utf-8', {
        'Cache-Control': 'public, max-age=300',
      })
    );

  const missing = async (why: Missing) =>
    answer(
      await render.missing({ why, site, inApp, url: url.href, app }),
      MISSING_STATUS[why],
      headers(env, 'text/html; charset=utf-8', {
        ...NO_CACHE,
        'X-Robots-Tag': 'noindex, nofollow',
      })
    );

  if (!live) {
    if (state.kind !== 'site') return missing(state.kind);
    return missing(
      state.status === 'offline'
        ? 'offline'
        : state.status === 'paused'
          ? 'paused'
          : state.status === 'deleted'
            ? 'removed'
            : 'not-live'
    );
  }

  // Each version is drawn once per data centre and browser kind, then kept:
  // a publish or a rollback changes the version, so the old copy is never
  // asked for again.
  const version = live.liveVersion!;
  const etag = `W/"v${version}-${inApp ?? 'web'}-${env.BUILD_ID ?? 'dev'}"`;
  const pageHeaders = headers(env, 'text/html; charset=utf-8', {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    ETag: etag,
    Vary: 'User-Agent',
  });

  if (site.path === 'sitemap.xml') {
    if (noindex) return missing('no-page');
    const snapshot = await versionSnapshot(env.DB, live.siteId, version);
    return answer(
      sitemapXml(site.base, snapshot?.pages ?? [], live.publishedAt ?? ''),
      200,
      headers(env, 'application/xml; charset=utf-8', {
        'Cache-Control': 'public, max-age=300',
      })
    );
  }

  if (request.headers.get('If-None-Match') === etag)
    return new Response(null, { status: 304, headers: pageHeaders });

  const key = new Request(
    `https://cache.levuche.invalid/${site.handle}/v${version}/${site.path}?b=${inApp ?? 'web'}&build=${env.BUILD_ID ?? 'dev'}&base=${encodeURIComponent(site.base)}`
  );
  const kept = await cache?.match(key);
  if (kept) {
    const robots = kept.headers.get('X-Robots-Tag');
    if (robots && !noindex) pageHeaders.set('X-Robots-Tag', robots);
    pageHeaders.set('X-Levuche-Cache', 'hit');
    return answer(await kept.text(), kept.status, pageHeaders);
  }

  const snapshot = await versionSnapshot(env.DB, live.siteId, version);
  const page = snapshot?.pages.find((one) => one.path === site.path);
  if (!snapshot || !page) return missing('no-page');

  const html = await render.page({
    site,
    page,
    snapshot,
    inApp,
    url: url.href,
    app,
  });
  if (page.hidden && !noindex) pageHeaders.set('X-Robots-Tag', 'noindex');
  await cache?.put(
    key,
    new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
        ...(page.hidden ? { 'X-Robots-Tag': 'noindex' } : {}),
      },
    })
  );
  pageHeaders.set('X-Levuche-Cache', 'miss');
  return answer(html, 200, pageHeaders);
}
