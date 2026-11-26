// siteStore against a local D1 with the real migrations applied, mainly to
// prove that one workspace can't read or change another's rows.
// Run with `npm test`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { D1Database } from '@cloudflare/workers-types';
import { getPlatformProxy } from 'wrangler';
import { siteStore } from './db.ts';

const dir = mkdtempSync(join(tmpdir(), 'levuche-db-'));
let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let db: D1Database;

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
  db = proxy.env.DB;
});

after(async () => {
  await proxy?.dispose();
  rmSync(dir, { recursive: true, force: true });
});

test('a new site gets its handle and an empty home page', async () => {
  const store = siteStore(db, { workspaceId: 'ws-new' });
  const site = await store.create('sam');
  assert.ok(site);
  assert.equal(site.handle, 'sam');
  assert.equal(site.status, 'unpublished');
  assert.equal(site.liveVersion, null);
  assert.deepEqual(await store.list(), [site]);

  const [home, ...rest] = await store.pages(site.id);
  assert.deepEqual(rest, []);
  assert.equal(home.path, '');
  assert.equal(home.title, 'Home');
  assert.equal(home.isHome, true);
  assert.equal(home.hidden, false);
});

test('a taken or reserved handle gives no site', async () => {
  await siteStore(db, { workspaceId: 'ws-first' }).create('taken');
  await db
    .prepare("INSERT INTO handles (handle, kind) VALUES ('help', 'reserved')")
    .run();
  const store = siteStore(db, { workspaceId: 'ws-second' });

  assert.equal(await store.create('taken'), null);
  assert.equal(await store.create('help'), null);
  assert.deepEqual(await store.list(), []);
});

test("one workspace can't read or change another's site", async () => {
  const mine = siteStore(db, { workspaceId: 'ws-mine' });
  const theirs = siteStore(db, { workspaceId: 'ws-theirs' });
  const site = await mine.create('mine');
  assert.ok(site);
  const [home] = await mine.pages(site.id);

  assert.equal(await theirs.get(site.id), null);
  assert.deepEqual(await theirs.list(), []);
  assert.deepEqual(await theirs.pages(site.id), []);
  assert.equal(
    await theirs.updatePage(home.id, { title: 'Taken over' }),
    false
  );
  assert.equal((await mine.pages(site.id))[0].title, 'Home');
});

test('changing a page marks the draft as changed', async () => {
  const store = siteStore(db, { workspaceId: 'ws-draft' });
  const site = await store.create('draft');
  assert.ok(site);
  const [home] = await store.pages(site.id);
  const before = '2026-01-01T00:00:00.000Z';
  await db
    .prepare('UPDATE sites SET draft_changed_at = ?1 WHERE id = ?2')
    .bind(before, site.id)
    .run();

  assert.equal(
    await store.updatePage(home.id, { title: 'Start here', hidden: true }),
    true
  );
  const [changed] = await store.pages(site.id);
  assert.equal(changed.title, 'Start here');
  assert.equal(changed.hidden, true);
  assert.equal(changed.frame, 'beside');
  assert.ok((await store.get(site.id))!.draftChangedAt > before);
});

test('a workspace holds one site', async () => {
  const store = siteStore(db, { workspaceId: 'ws-one' });
  assert.ok(await store.create('first'));
  await assert.rejects(store.create('second'), /sites\.workspace_id/);
});

test('deleted sites leave the list', async () => {
  const store = siteStore(db, { workspaceId: 'ws-deleted' });
  const site = await store.create('gone');
  assert.ok(site);
  await db
    .prepare("UPDATE sites SET status = 'deleted' WHERE id = ?1")
    .bind(site.id)
    .run();
  assert.deepEqual(await store.list(), []);
});
