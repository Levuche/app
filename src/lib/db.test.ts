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
import {
  draftByPreviewToken,
  hasDraftChanges,
  MAX_BLOCKS,
  siteStore,
  takenHandles,
} from './db.ts';
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

test('blocks are added, changed, moved and removed in order', async () => {
  const store = siteStore(db, { workspaceId: 'ws-edit' });
  const site = await store.create('editing', starterBlocks('Edit me'));
  assert.ok(site);
  const [home] = await store.pages(site.id);
  const types = async () => (await store.blocks(home.id)).map((b) => b.type);

  const text = await store.addBlock(home.id, 'text-block', { text: 'Hi' });
  assert.ok(text);
  assert.equal(text.position, 3);
  assert.deepEqual(await types(), [
    'creator-header',
    'social-icons',
    'link-list',
    'text-block',
  ]);

  assert.equal(await store.updateBlock(text.id, { text: 'Hello' }), true);
  assert.deepEqual(
    (await store.blocks(home.id)).find((b) => b.id === text.id)?.props,
    { text: 'Hello' }
  );

  assert.equal(await store.moveBlock(text.id, 1), true);
  assert.deepEqual(await types(), [
    'creator-header',
    'text-block',
    'social-icons',
    'link-list',
  ]);
  // Past the end goes to the end.
  assert.equal(await store.moveBlock(text.id, 99), true);
  assert.deepEqual(
    (await store.blocks(home.id)).map((b) => [b.type, b.position]),
    [
      ['creator-header', 0],
      ['social-icons', 1],
      ['link-list', 2],
      ['text-block', 3],
    ]
  );

  const [header] = await store.blocks(home.id);
  assert.equal(await store.removeBlock(header.id), true);
  assert.deepEqual(
    (await store.blocks(home.id)).map((b) => [b.type, b.position]),
    [
      ['social-icons', 0],
      ['link-list', 1],
      ['text-block', 2],
    ]
  );
});

test("one workspace can't change another's blocks", async () => {
  const mine = siteStore(db, { workspaceId: 'ws-blocks-mine' });
  const theirs = siteStore(db, { workspaceId: 'ws-blocks-theirs' });
  const site = await mine.create('mine-only', starterBlocks('Mine'));
  assert.ok(site);
  const [home] = await mine.pages(site.id);
  const [header] = await mine.blocks(home.id);

  assert.equal(await theirs.addBlock(home.id, 'text-block', {}), null);
  assert.equal(await theirs.updateBlock(header.id, { name: 'Taken' }), false);
  assert.equal(await theirs.moveBlock(header.id, 2), false);
  assert.equal(await theirs.removeBlock(header.id), false);
  assert.equal(await theirs.blockPage(header.id), null);

  const blocks = await mine.blocks(home.id);
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[0].props, { name: 'Mine' });
});

test('a page holds at most MAX_BLOCKS blocks', async () => {
  const store = siteStore(db, { workspaceId: 'ws-full' });
  const site = await store.create('full-page');
  assert.ok(site);
  const [home] = await store.pages(site.id);
  for (let i = 0; i < MAX_BLOCKS; i++) {
    assert.ok(await store.addBlock(home.id, 'text-block', { text: `${i}` }));
  }
  assert.equal(await store.addBlock(home.id, 'text-block', {}), null);
  assert.equal((await store.blocks(home.id)).length, MAX_BLOCKS);
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

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test('publishing makes numbered versions, and rolling back keeps the draft', async () => {
  const store = siteStore(db, { workspaceId: 'ws-publish' });
  const site = await store.create('publish-me', starterBlocks('Pub'));
  assert.ok(site);
  assert.equal(hasDraftChanges(site), true);

  assert.equal(await store.publish(site.id, 'user-1', 'First'), 1);
  let now = await store.get(site.id);
  assert.ok(now);
  assert.equal(now.status, 'live');
  assert.equal(now.liveVersion, 1);
  assert.equal(hasDraftChanges(now), false);

  // A change to the draft shows as draft changes, until the next publish.
  await tick();
  const [home] = await store.pages(site.id);
  const [header] = await store.blocks(home.id);
  await store.updateBlock(header.id, { name: 'Pub two' });
  now = await store.get(site.id);
  assert.ok(now);
  assert.equal(hasDraftChanges(now), true);
  assert.equal(await store.publish(site.id, 'user-2', null), 2);

  const versions = await store.versions(site.id);
  assert.deepEqual(
    versions.map(({ number, note, publishedBy }) => ({
      number,
      note,
      publishedBy,
    })),
    [
      { number: 2, note: null, publishedBy: 'user-2' },
      { number: 1, note: 'First', publishedBy: 'user-1' },
    ]
  );
  const stored = await db
    .prepare('SELECT snapshot FROM versions WHERE site_id = ?1 AND number = 1')
    .bind(site.id)
    .first<{ snapshot: string }>();
  const first = JSON.parse(stored?.snapshot ?? '{}');
  assert.equal(first.pages[0].blocks[0].props.name, 'Pub');
  assert.equal(first.pages[0].blocks.length, 3);

  // Rolling back makes version 1 live and leaves the draft alone.
  assert.equal(await store.rollback(site.id, 1), true);
  assert.equal((await store.get(site.id))?.liveVersion, 1);
  assert.deepEqual((await store.blocks(home.id))[0].props, { name: 'Pub two' });
  assert.equal(await store.rollback(site.id, 9), false);
});

test('two publishes at once each get their own number', async () => {
  const store = siteStore(db, { workspaceId: 'ws-race' });
  const site = await store.create('race-me', starterBlocks('Race'));
  assert.ok(site);
  const numbers = await Promise.all([
    store.publish(site.id, 'a', null),
    store.publish(site.id, 'b', null),
    store.publish(site.id, 'c', null),
  ]);
  assert.deepEqual([...numbers].sort(), [1, 2, 3]);
  assert.equal((await store.get(site.id))?.liveVersion !== null, true);
});

test('an offline site stays offline when published; a paused one is not published', async () => {
  const store = siteStore(db, { workspaceId: 'ws-pub-offline' });
  const site = await store.create('pub-offline', starterBlocks('Off'));
  assert.ok(site);
  await store.publish(site.id, 'u', null);
  await store.setOffline(site.id, true);
  assert.equal(await store.publish(site.id, 'u', null), 2);
  assert.equal((await store.get(site.id))?.status, 'offline');

  await db
    .prepare("UPDATE sites SET status = 'paused' WHERE id = ?1")
    .bind(site.id)
    .run();
  assert.equal(await store.publish(site.id, 'u', null), null);
  assert.equal(await store.rollback(site.id, 1), false);
});

test("one workspace can't publish, roll back or read another's versions", async () => {
  const mine = siteStore(db, { workspaceId: 'ws-pub-mine' });
  const theirs = siteStore(db, { workspaceId: 'ws-pub-theirs' });
  const site = await mine.create('pub-mine', starterBlocks('Mine'));
  assert.ok(site);
  await mine.publish(site.id, 'u', null);

  assert.equal(await theirs.publish(site.id, 'x', null), null);
  assert.equal(await theirs.rollback(site.id, 1), false);
  assert.deepEqual(await theirs.versions(site.id), []);
  assert.equal(await theirs.draft(site.id), null);
  assert.equal(await theirs.previewToken(site.id), null);
  await theirs.setPreview(site.id, true);
  assert.equal(await mine.previewToken(site.id), null);
});

test('the preview link opens the draft until it is turned off', async () => {
  const store = siteStore(db, { workspaceId: 'ws-preview' });
  const site = await store.create('preview-me', starterBlocks('Peek'));
  assert.ok(site);

  const token = await store.setPreview(site.id, true);
  assert.ok(token);
  assert.match(token, /^[0-9a-z]{64}$/);
  assert.equal(await store.previewToken(site.id), token);
  const found = await draftByPreviewToken(db, token);
  assert.equal(found?.handle, 'preview-me');
  assert.equal(found?.draft.pages[0].blocks[0].props.name, 'Peek');

  // Turning it on again makes a new link; the old one stops working.
  const again = await store.setPreview(site.id, true);
  assert.notEqual(again, token);
  assert.equal(await draftByPreviewToken(db, token), null);

  assert.equal(await store.setPreview(site.id, false), null);
  assert.equal(await draftByPreviewToken(db, again ?? ''), null);
  assert.equal(await draftByPreviewToken(db, 'not-a-token'), null);
});
