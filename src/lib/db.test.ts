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
import { siteStore, takenHandles } from './db.ts';
import { starterBlocks } from './starter.ts';

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

test('a live site goes offline and back, and nothing else moves', async () => {
  const store = siteStore(db, { workspaceId: 'ws-offline' });
  const site = await store.create('on-off');
  assert.ok(site);
  // Never published: there's nothing to take offline.
  assert.equal(await store.setOffline(site.id, true), false);

  await db
    .prepare("UPDATE sites SET status = 'live', live_version = 1 WHERE id = ?1")
    .bind(site.id)
    .run();
  assert.equal(
    await siteStore(db, { workspaceId: 'ws-not-theirs' }).setOffline(
      site.id,
      true
    ),
    false
  );
  assert.equal(await store.setOffline(site.id, true), true);
  assert.equal((await store.get(site.id))?.status, 'offline');
  assert.equal(await store.setOffline(site.id, true), false);
  assert.equal(await store.setOffline(site.id, false), true);
  assert.equal((await store.get(site.id))?.status, 'live');
  assert.equal((await store.get(site.id))?.liveVersion, 1);

  // A site the team paused stays paused.
  await db
    .prepare("UPDATE sites SET status = 'paused' WHERE id = ?1")
    .bind(site.id)
    .run();
  assert.equal(await store.setOffline(site.id, false), false);
  assert.equal(await store.setOffline(site.id, true), false);
});

test('a new site opens with the starting layout, in order', async () => {
  const store = siteStore(db, { workspaceId: 'ws-starter' });
  const site = await store.create('starter', starterBlocks('Sam Rivera'));
  assert.ok(site);
  const [home] = await store.pages(site.id);
  const blocks = await store.blocks(home.id);
  assert.deepEqual(
    blocks.map(({ type, props, position }) => ({ type, props, position })),
    starterBlocks('Sam Rivera').map((block, position) => ({
      ...block,
      position,
    }))
  );
  // Another workspace sees none of them.
  assert.deepEqual(
    await siteStore(db, { workspaceId: 'ws-other' }).blocks(home.id),
    []
  );
});

test('taken, held and reserved handles all count as taken', async () => {
  const site = await siteStore(db, { workspaceId: 'ws-taken' }).create(
    'in-use'
  );
  assert.ok(site);
  await db
    .prepare(
      "INSERT INTO handles (handle, site_id, kind, free_at) VALUES ('was-mine', ?1, 'held', '2099-01-01T00:00:00Z')"
    )
    .bind(site.id)
    .run();
  await db
    .prepare("INSERT INTO handles (handle, kind) VALUES ('kept', 'reserved')")
    .run();
  assert.deepEqual(
    [
      ...(await takenHandles(db, ['in-use', 'was-mine', 'kept', 'free-one'])),
    ].sort(),
    ['in-use', 'kept', 'was-mine']
  );
  assert.deepEqual([...(await takenHandles(db, []))], []);
});
