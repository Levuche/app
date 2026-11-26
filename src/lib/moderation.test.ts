// Reports and pauses (#33) against a local D1 with the real migrations.
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
import {
  appeal,
  closeReports,
  fileReport,
  moderationLog,
  openReports,
  pausedSites,
  pauseNotice,
  pauseSite,
  reportCopy,
  REPORTS_PER_DAY,
  unpauseSite,
  visitorKey,
} from './moderation.ts';
import { starterBlocks } from './starter.ts';

const dir = mkdtempSync(join(tmpdir(), 'levuche-moderation-'));
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

async function liveSite(workspaceId: string, handle: string) {
  const store = siteStore(db, { workspaceId });
  const site = await store.create(handle, starterBlocks(handle));
  assert.ok(site);
  assert.equal(await store.publish(site.id, 'creator-1', null), 1);
  return { store, site };
}

const status = async (siteId: string) =>
  (
    await db
      .prepare('SELECT status FROM sites WHERE id = ?1')
      .bind(siteId)
      .first<{ status: string }>()
  )?.status;

test('a visitor key never holds the address, and changes each day', async () => {
  const today = await visitorKey('203.0.113.9', '2026-11-26');
  assert.match(today, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(today, /203/);
  assert.equal(today, await visitorKey('203.0.113.9', '2026-11-26'));
  assert.notEqual(today, await visitorKey('203.0.113.9', '2026-11-27'));
  assert.notEqual(today, await visitorKey('203.0.113.10', '2026-11-26'));
});

test('a report keeps a copy of the live version, once per visitor and site', async () => {
  const { store, site } = await liveSite('ws-reported', 'reported-one');
  const visitor = await visitorKey('198.51.100.1');
  const report = {
    handle: 'reported-one',
    path: '',
    reason: 'spam' as const,
    details: 'Asks for card details.',
    visitor,
  };
  assert.equal(await fileReport(db, report), 'sent');
  assert.equal(await fileReport(db, report), 'again');
  assert.equal(
    await fileReport(db, {
      ...report,
      visitor: await visitorKey('198.51.100.2'),
    }),
    'sent'
  );

  // The creator publishes again; the report still shows what was reported.
  const [home] = await store.pages(site.id);
  const [header] = await store.blocks(home.id);
  assert.ok(await store.removeBlock(header.id));
  assert.equal(await store.publish(site.id, 'creator-1', null), 2);

  const [reported] = (await openReports(db)).filter(
    (one) => one.siteId === site.id
  );
  assert.equal(reported.reports.length, 2);
  assert.equal(reported.reports[0].version, 1);
  const copy = await reportCopy(db, reported.reports[0].id);
  assert.equal(copy?.snapshot.pages[0].blocks.length, 3);
  assert.equal(copy?.reason, 'spam');
});

test('only live sites can be reported, and a visitor has a daily limit', async () => {
  const draft = siteStore(db, { workspaceId: 'ws-draft-only' });
  assert.ok(await draft.create('draft-only'));
  const visitor = await visitorKey('198.51.100.50');
  const base = { path: '', reason: 'other' as const, details: null, visitor };
  assert.equal(
    await fileReport(db, { ...base, handle: 'draft-only' }),
    'not-found'
  );
  assert.equal(
    await fileReport(db, { ...base, handle: 'nobody-at-all' }),
    'not-found'
  );

  for (let i = 0; i < REPORTS_PER_DAY; i++) {
    await liveSite(`ws-many-${i}`, `many-${i}`);
    assert.equal(
      await fileReport(db, { ...base, handle: `many-${i}` }),
      'sent'
    );
  }
  await liveSite('ws-one-more', 'one-more');
  assert.equal(
    await fileReport(db, { ...base, handle: 'one-more' }),
    'limited'
  );
});

test('pausing hides a site and closes its reports; unpausing gives back its status', async () => {
  const { site } = await liveSite('ws-pause', 'pause-me');
  await fileReport(db, {
    handle: 'pause-me',
    path: '',
    reason: 'hate',
    details: null,
    visitor: await visitorKey('198.51.100.70'),
  });
  assert.ok(
    await pauseSite(db, {
      siteId: site.id,
      reason: 'hate',
      note: 'The second link goes to a page of slurs.',
      actor: 'staff-1',
    })
  );
  assert.equal(await status(site.id), 'paused');
  assert.equal(
    (await openReports(db)).some((one) => one.siteId === site.id),
    false
  );
  // Pausing twice does nothing, and a paused site can't be published.
  assert.equal(
    await pauseSite(db, {
      siteId: site.id,
      reason: 'hate',
      note: null,
      actor: 'staff-1',
    }),
    false
  );
  assert.equal(
    await siteStore(db, { workspaceId: 'ws-pause' }).publish(
      site.id,
      'creator-1',
      null
    ),
    null
  );

  const [paused] = (await pausedSites(db)).filter(
    (one) => one.siteId === site.id
  );
  assert.equal(paused.reason, 'hate');
  assert.equal(paused.appeal, null);

  assert.ok(
    await unpauseSite(db, { siteId: site.id, note: 'Fixed.', actor: 'staff-2' })
  );
  assert.equal(await status(site.id), 'live');
  assert.equal(
    await unpauseSite(db, { siteId: site.id, note: null, actor: 'staff-2' }),
    false
  );

  const log = (await moderationLog(db)).filter(
    (entry) => entry.handle === 'pause-me'
  );
  assert.deepEqual(
    log.map((entry) => [entry.action, entry.actor]),
    [
      ['unpause', 'staff-2'],
      ['pause', 'staff-1'],
    ]
  );
});

test('an offline site goes back offline when unpaused', async () => {
  const { store, site } = await liveSite('ws-off-paused', 'off-paused');
  assert.ok(await store.setOffline(site.id, true));
  assert.ok(
    await pauseSite(db, {
      siteId: site.id,
      reason: 'other',
      note: null,
      actor: 's',
    })
  );
  // The creator can't put it back online while it's paused.
  assert.equal(await store.setOffline(site.id, false), false);
  assert.ok(await unpauseSite(db, { siteId: site.id, note: null, actor: 's' }));
  assert.equal(await status(site.id), 'offline');
});

test('closing reports keeps the site up and is logged', async () => {
  const { site } = await liveSite('ws-close', 'close-me');
  await fileReport(db, {
    handle: 'close-me',
    path: '',
    reason: 'copyright',
    details: null,
    visitor: await visitorKey('198.51.100.80'),
  });
  assert.equal(
    await closeReports(db, {
      siteId: site.id,
      note: 'Their own photos.',
      actor: 's',
    }),
    1
  );
  assert.equal(await status(site.id), 'live');
  assert.equal(
    await closeReports(db, { siteId: site.id, note: null, actor: 's' }),
    0
  );
  const log = (await moderationLog(db)).filter(
    (entry) => entry.handle === 'close-me'
  );
  assert.deepEqual(
    log.map((entry) => entry.action),
    ['close']
  );
});

test('a creator sees why their site is paused and can appeal once', async () => {
  const { site } = await liveSite('ws-appeal', 'appeal-me');
  assert.equal(await pauseNotice(db, 'ws-appeal', site.id), null);
  await pauseSite(db, {
    siteId: site.id,
    reason: 'impersonation',
    note: 'The page uses another artist’s name.',
    actor: 's',
  });
  // Another workspace sees nothing and can't appeal.
  assert.equal(await pauseNotice(db, 'ws-other', site.id), null);
  assert.equal(
    await appeal(db, {
      workspaceId: 'ws-other',
      siteId: site.id,
      note: 'Hi',
      actor: 'x',
    }),
    false
  );

  const notice = await pauseNotice(db, 'ws-appeal', site.id);
  assert.equal(notice?.reason, 'impersonation');
  assert.equal(notice?.note, 'The page uses another artist’s name.');
  assert.equal(notice?.appealedAt, null);

  assert.equal(
    await appeal(db, {
      workspaceId: 'ws-appeal',
      siteId: site.id,
      note: '  ',
      actor: 'c',
    }),
    false
  );
  assert.ok(
    await appeal(db, {
      workspaceId: 'ws-appeal',
      siteId: site.id,
      note: 'It is my stage name.',
      actor: 'c',
    })
  );
  assert.ok((await pauseNotice(db, 'ws-appeal', site.id))?.appealedAt);
  assert.equal(
    await appeal(db, {
      workspaceId: 'ws-appeal',
      siteId: site.id,
      note: 'Again',
      actor: 'c',
    }),
    false
  );
  const [paused] = (await pausedSites(db)).filter(
    (one) => one.siteId === site.id
  );
  assert.equal(paused.appeal?.note, 'It is my stage name.');
});
