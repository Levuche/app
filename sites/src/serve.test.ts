// The sites Worker's answers (#23), against a local D1 with the app's real
// migrations, with a stand-in renderer (the real one draws React, which
// these tests can't load). Run with `npm test`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { D1Database } from '@cloudflare/workers-types';
import { getPlatformProxy } from 'wrangler';
import { siteStore } from '../../src/lib/db.ts';
import { starterBlocks } from '../../src/lib/starter.ts';
import { locate } from './locate.ts';
import { failed, type Renderer, serve, type SitesEnv } from './serve.ts';
import { androidOpenUrl, inAppBrowser, sitemapXml } from './visitor.ts';

const dir = mkdtempSync(join(tmpdir(), 'levuche-sites-'));
let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let env: SitesEnv;

before(async () => {
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'migrations',
      'apply',
      'DB',
      '--local',
      '--persist-to',
      dir,
    ],
    { env: { ...process.env, CI: '1' }, stdio: 'pipe' }
  );
  proxy = await getPlatformProxy<{ DB: D1Database }>({
    persist: { path: join(dir, 'v3') },
  });
  env = { DB: proxy.env.DB, BUILD_ID: 'test' };
});

after(async () => {
  await proxy?.dispose();
  rmSync(dir, { recursive: true, force: true });
});

/** Draws a page as its path and block count, and a missing page as why. */
const renderer: Renderer & { drawn: number } = {
  drawn: 0,
  page({ site, page, inApp }) {
    renderer.drawn += 1;
    return `page ${site.handle}/${page.path} blocks=${page.blocks.length} inApp=${inApp}`;
  },
  intro({ url }) {
    return `intro ${url}`;
  },
  missing({ why }) {
    return `missing ${why}`;
  },
};

/** A Cache API stand-in, kept in memory. */
function memoryCache() {
  const kept = new Map<string, Response>();
  return {
    async match(key: Request) {
      return kept.get(key.url)?.clone();
    },
    async put(key: Request, response: Response) {
      kept.set(key.url, response.clone());
    },
  } as unknown as Cache;
}

const get = (url: string, init: RequestInit = {}, cache?: Cache) =>
  serve(new Request(url, init), env, renderer, cache);

async function liveSite(workspaceId: string, handle: string) {
  const store = siteStore(env.DB, { workspaceId });
  const site = await store.create(handle, starterBlocks(handle));
  assert.ok(site);
  assert.equal(await store.publish(site.id, 'user-1', null), 1);
  return { store, site };
}

test('addresses: a handle per subdomain, or per path on the dev host', () => {
  const config = {
    SITES_DOMAIN: 'levuche.page',
    SITES_PATH_HOST: 'sites-dev.levuche.com',
  };
  assert.deepEqual(locate(new URL('https://sam.levuche.page/'), config), {
    handle: 'sam',
    path: '',
    base: 'https://sam.levuche.page',
  });
  assert.equal(
    locate(new URL('https://SAM.levuche.page/Shop/'), config)?.path,
    'shop'
  );
  assert.equal(locate(new URL('https://a.b.levuche.page/'), config), null);
  assert.equal(locate(new URL('https://sa.levuche.page/'), config), null);
  assert.equal(locate(new URL('https://sam.example.com/'), config), null);
  assert.deepEqual(
    locate(new URL('https://sites-dev.levuche.com/sam/shop'), config),
    {
      handle: 'sam',
      path: 'shop',
      base: 'https://sites-dev.levuche.com/sam',
    }
  );
  assert.equal(locate(new URL('https://sites-dev.levuche.com/'), config), null);
});

test('a live site serves its published home page, cached by version', async () => {
  const { store, site } = await liveSite('ws-live', 'live-one');
  const cache = memoryCache();
  const first = await get('https://live-one.levuche.page/', {}, cache);
  assert.equal(first.status, 200);
  assert.match(await first.text(), /^page live-one\/ blocks=3/);
  assert.equal(first.headers.get('X-Levuche-Cache'), 'miss');
  assert.match(
    first.headers.get('Content-Security-Policy') ?? '',
    /default-src 'none'/
  );
  assert.equal(first.headers.get('Set-Cookie'), null);
  assert.equal(first.headers.get('X-Robots-Tag'), null);

  const drawn = renderer.drawn;
  const second = await get('https://live-one.levuche.page/', {}, cache);
  assert.equal(second.headers.get('X-Levuche-Cache'), 'hit');
  assert.equal(renderer.drawn, drawn);

  // The browser's copy is still good until the next publish.
  const etag = first.headers.get('ETag') ?? '';
  const unchanged = await get('https://live-one.levuche.page/', {
    headers: { 'If-None-Match': etag },
  });
  assert.equal(unchanged.status, 304);

  // A publish changes the version, so the page is drawn again.
  const [home] = await store.pages(site.id);
  const [header] = await store.blocks(home.id);
  assert.ok(header);
  assert.ok(await store.removeBlock(header.id));
  assert.equal(await store.publish(site.id, 'user-1', null), 2);
  const after = await get(
    'https://live-one.levuche.page/',
    {
      headers: { 'If-None-Match': etag },
    },
    cache
  );
  assert.equal(after.status, 200);
  assert.equal(after.headers.get('X-Levuche-Cache'), 'miss');
  assert.match(await after.text(), /blocks=2/);

  // A rollback does too.
  assert.ok(await store.rollback(site.id, 1));
  assert.match(
    await (await get('https://live-one.levuche.page/', {}, cache)).text(),
    /blocks=3/
  );
});

test('a site that isn’t live says why, and is never indexed', async () => {
  const unpublished = siteStore(env.DB, { workspaceId: 'ws-draft' });
  assert.ok(await unpublished.create('not-yet'));
  const { store: offStore, site: off } = await liveSite('ws-off', 'gone-quiet');
  await offStore.setOffline(off.id, true);
  const { site: paused } = await liveSite('ws-paused', 'on-hold');
  await env.DB.prepare(`UPDATE sites SET status = 'paused' WHERE id = ?1`)
    .bind(paused.id)
    .run();
  const { site: deleted } = await liveSite('ws-deleted', 'was-here');
  await env.DB.prepare(`UPDATE handles SET kind = 'held' WHERE site_id = ?1`)
    .bind(deleted.id)
    .run();
  await env.DB.prepare(
    `INSERT INTO handles (handle, site_id, kind) VALUES ('kept-back', NULL, 'reserved')`
  ).run();

  for (const [handle, why, status] of [
    ['nobody-yet', 'free', 404],
    ['kept-back', 'none', 404],
    // Kept for Levuche in code, with no row: not free to claim.
    ['test', 'none', 404],
    ['not-yet', 'not-live', 404],
    ['gone-quiet', 'offline', 404],
    ['on-hold', 'paused', 404],
    ['was-here', 'removed', 410],
  ] as const) {
    const response = await get(`https://${handle}.levuche.page/`);
    assert.equal(response.status, status, handle);
    assert.equal(await response.text(), `missing ${why}`, handle);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const robots = await (
      await get(`https://${handle}.levuche.page/robots.txt`)
    ).text();
    assert.match(robots, /Disallow: \//, handle);
  }
});

test('an address no handle could have gets a page, not bare text', async () => {
  for (const address of [
    'https://sa.levuche.page/',
    'https://a.b.levuche.page/shop',
  ]) {
    const response = await get(address);
    assert.equal(response.status, 404, address);
    assert.equal(await response.text(), 'missing none', address);
    assert.equal(
      response.headers.get('Content-Type'),
      'text/html; charset=utf-8'
    );
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  }
});

test('when answering fails, the visitor gets the error page', async () => {
  const response = await failed(
    new Request('https://sam.levuche.page/shop'),
    env,
    renderer
  );
  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'missing error');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(
    response.headers.get('Content-Security-Policy') ?? '',
    /default-src 'none'/
  );

  // And plain text if even that page can't be drawn.
  const broken: Renderer = {
    page: () => '',
    intro: () => '',
    missing: () => {
      throw new Error('no');
    },
  };
  const plain = await failed(
    new Request('https://sam.levuche.page/'),
    env,
    broken
  );
  assert.equal(plain.status, 500);
  assert.match(await plain.text(), /Something went wrong/);
});

test('a live site has robots.txt, a sitemap and a not-found page', async () => {
  await liveSite('ws-crawl', 'crawl-me');
  const robots = await (
    await get('https://crawl-me.levuche.page/robots.txt')
  ).text();
  assert.match(robots, /Allow: \//);
  assert.match(
    robots,
    /Sitemap: https:\/\/crawl-me\.levuche\.page\/sitemap\.xml/
  );
  const sitemap = await get('https://crawl-me.levuche.page/sitemap.xml');
  assert.equal(
    sitemap.headers.get('Content-Type'),
    'application/xml; charset=utf-8'
  );
  assert.match(
    await sitemap.text(),
    /<loc>https:\/\/crawl-me\.levuche\.page\/<\/loc>/
  );

  const missing = await get('https://crawl-me.levuche.page/nothing-here');
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), 'missing no-page');
});

test('the dev host is never indexed, and only GET and HEAD are answered', async () => {
  await liveSite('ws-dev', 'dev-look');
  const dev: SitesEnv = {
    ...env,
    SITES_PATH_HOST: 'sites-dev.levuche.com',
    SITES_NOINDEX: 'true',
  };
  const page = await serve(
    new Request('https://sites-dev.levuche.com/dev-look'),
    dev,
    renderer
  );
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const robots = await serve(
    new Request('https://sites-dev.levuche.com/robots.txt'),
    dev,
    renderer
  );
  assert.match(await robots.text(), /Disallow: \//);

  const head = await get('https://dev-look.levuche.page/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(
    (await get('https://dev-look.levuche.page/', { method: 'POST' })).status,
    405
  );
  // levuche.page itself introduces Levuche; www and other paths go there.
  const apex = await get('https://levuche.page/?utm_source=bio');
  assert.equal(apex.status, 200);
  assert.equal(await apex.text(), 'intro https://levuche.page/');
  for (const other of [
    'https://www.levuche.page/',
    'https://levuche.page/shop',
  ]) {
    const moved = await get(other);
    assert.equal(moved.status, 301, other);
    assert.equal(moved.headers.get('Location'), 'https://levuche.page/');
  }
  const devHome = await serve(
    new Request('https://sites-dev.levuche.com/'),
    dev,
    renderer
  );
  assert.equal(await devHome.text(), 'intro https://sites-dev.levuche.com/');
});

test('a social app’s own browser is told apart, and gets its own copy', async () => {
  const instagram =
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 Instagram 312.0.0';
  assert.equal(inAppBrowser(instagram), 'android');
  assert.equal(
    inAppBrowser(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]'
    ),
    'ios'
  );
  assert.equal(
    inAppBrowser(
      'Mozilla/5.0 (iPhone) Version/17.0 Mobile/15E148 Safari/604.1'
    ),
    null
  );
  assert.equal(inAppBrowser(null), null);
  assert.equal(
    androidOpenUrl('https://sam.levuche.page/shop'),
    'intent://sam.levuche.page/shop#Intent;scheme=https;S.browser_fallback_url=https%3A%2F%2Fsam.levuche.page%2Fshop;end'
  );

  await liveSite('ws-inapp', 'in-app');
  const page = await get('https://in-app.levuche.page/', {
    headers: { 'User-Agent': instagram },
  });
  assert.match(await page.text(), /inApp=android$/);
  assert.match(page.headers.get('ETag') ?? '', /-android-/);
});

test('the sitemap leaves out pages kept to their link, and escapes addresses', () => {
  const xml = sitemapXml(
    'https://sam.levuche.page',
    [
      { path: '', hidden: false },
      { path: 'secret', hidden: true },
      { path: 'a&b', hidden: false },
    ],
    '2026-11-26T10:00:00.000Z'
  );
  assert.match(xml, /<loc>https:\/\/sam\.levuche\.page\/<\/loc>/);
  assert.doesNotMatch(xml, /secret/);
  assert.match(xml, /a&#38;b/);
});
