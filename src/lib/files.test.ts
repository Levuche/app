// Uploads, storage and clean-up of pictures (#24), against a local D1 with
// the real migrations and an in-memory bucket. Run with `npm test`.
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
  type FileBucket,
  fileKey,
  finishUpload,
  startUpload,
  storageUsed,
  storedFile,
  sweepFiles,
} from './files.ts';
import { MAX_PICTURE_BYTES, SITE_STORAGE_BYTES } from './pictures.ts';

const dir = mkdtempSync(join(tmpdir(), 'levuche-files-'));
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

/** An R2 bucket in memory. */
function memoryBucket() {
  const objects = new Map<string, Uint8Array>();
  const bucket: FileBucket = {
    async put(key, value) {
      objects.set(key, value);
    },
    async get(key) {
      const value = objects.get(key);
      return value
        ? {
            body: new Blob([new Uint8Array(value)]).stream(),
            size: value.length,
          }
        : null;
    },
    async delete(keys) {
      for (const key of [keys].flat()) objects.delete(key);
    },
  };
  return { bucket, objects };
}

const be32 = (n: number) => [
  n >>> 24,
  (n >> 16) & 0xff,
  (n >> 8) & 0xff,
  n & 0xff,
];
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** A small PNG with a place written in it. */
function png(width = 20, height = 10, padding = 0) {
  const chunk = (type: string, body: number[]) => [
    ...be32(body.length),
    ...text(type),
    ...body,
    0,
    0,
    0,
    0,
  ];
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', [...be32(width), ...be32(height), 8, 6, 0, 0, 0]),
    ...chunk('tEXt', text('Location\0home')),
    ...chunk('IDAT', new Array(padding).fill(7)),
    ...chunk('IEND', []),
  ]);
}

async function newSite(workspaceId: string) {
  const site = await siteStore(db, { workspaceId }).create(workspaceId);
  assert.ok(site);
  return site;
}

async function upload(siteId: string, bytes: Uint8Array, bucket: FileBucket) {
  const started = await startUpload(db, {
    siteId,
    type: 'image/png',
    bytes: bytes.length,
    by: 'creator-1',
  });
  assert.ok('token' in started);
  return finishUpload(db, bucket, started.token, bytes);
}

test('a picture is kept once, without its text data', async () => {
  const site = await newSite('files-once');
  const { bucket, objects } = memoryBucket();
  const picture = png();
  const started = await startUpload(db, {
    siteId: site.id,
    type: 'image/png',
    bytes: picture.length,
    by: 'creator-1',
  });
  assert.ok('token' in started);

  const done = await finishUpload(db, bucket, started.token, picture);
  assert.ok('file' in done);
  assert.equal(done.file.width, 20);
  assert.ok(done.file.bytes < picture.length);
  const kept = objects.get(fileKey(done.file.id));
  assert.ok(kept);
  assert.equal(Buffer.from(kept).includes('Location'), false);
  assert.equal((await storedFile(db, done.file.id))?.type, 'image/png');

  // The address works once.
  assert.deepEqual(await finishUpload(db, bucket, started.token, picture), {
    error: 'expired',
  });
  assert.deepEqual(await finishUpload(db, bucket, 'nope', picture), {
    error: 'expired',
  });
});

test('the type, size and dimensions are checked on the bytes', async () => {
  const site = await newSite('files-checks');
  const { bucket, objects } = memoryBucket();
  const by = 'creator-1';

  assert.deepEqual(
    await startUpload(db, {
      siteId: site.id,
      type: 'image/svg+xml',
      bytes: 10,
      by,
    }),
    { error: 'wrong-type' }
  );
  assert.deepEqual(
    await startUpload(db, {
      siteId: site.id,
      type: 'image/png',
      bytes: MAX_PICTURE_BYTES + 1,
      by,
    }),
    { error: 'too-big' }
  );

  // Said to be a JPEG, sent a PNG.
  const asJpeg = await startUpload(db, {
    siteId: site.id,
    type: 'image/jpeg',
    bytes: 1000,
    by,
  });
  assert.ok('token' in asJpeg);
  assert.deepEqual(await finishUpload(db, bucket, asJpeg.token, png()), {
    error: 'wrong-type',
  });

  // Bigger than it said.
  const small = await startUpload(db, {
    siteId: site.id,
    type: 'image/png',
    bytes: 10,
    by,
  });
  assert.ok('token' in small);
  assert.deepEqual(await finishUpload(db, bucket, small.token, png()), {
    error: 'too-big',
  });

  assert.deepEqual(await upload(site.id, png(5000, 10), bucket), {
    error: 'too-large',
  });
  assert.equal(objects.size, 0);
});

test('a site can fill its storage, and then has to make room', async () => {
  const site = await newSite('files-full');
  const { bucket } = memoryBucket();
  // One big picture, written straight in, nearly fills the site.
  await db
    .prepare(
      `INSERT INTO files (id, site_id, type, bytes, width, height, uploaded_by)
       VALUES (?1, ?2, 'image/png', ?3, 10, 10, 'creator-1')`
    )
    .bind(crypto.randomUUID(), site.id, SITE_STORAGE_BYTES - 100)
    .run();
  assert.equal(await storageUsed(db, site.id), SITE_STORAGE_BYTES - 100);
  assert.deepEqual(
    await startUpload(db, {
      siteId: site.id,
      type: 'image/png',
      bytes: 1000,
      by: 'creator-1',
    }),
    { error: 'full' }
  );
  // Another site isn't affected.
  const other = await newSite('files-full-other');
  assert.ok('file' in (await upload(other.id, png(), bucket)));
});

test('pictures nothing uses are removed, once an hour old', async () => {
  const site = await newSite('files-sweep');
  const store = siteStore(db, { workspaceId: 'files-sweep' });
  const { bucket, objects } = memoryBucket();
  const used = await upload(site.id, png(), bucket);
  const published = await upload(site.id, png(), bucket);
  const unused = await upload(site.id, png(), bucket);
  const fresh = await upload(site.id, png(), bucket);
  assert.ok('file' in used && 'file' in published && 'file' in unused);
  assert.ok('file' in fresh);

  const [home] = await store.pages(site.id);
  const block = await store.addBlock(home.id, 'site-image', {
    src: `https://app.levuche.com/files/${published.file.id}`,
  });
  assert.ok(block);
  assert.equal(await store.publish(site.id, 'creator-1', null), 1);
  // The draft moves on to another picture; version 1 keeps the first.
  assert.ok(
    await store.updateBlock(block.id, {
      src: `https://app.levuche.com/files/${used.file.id}`,
    })
  );

  await db
    .prepare(
      `UPDATE files SET created_at = '2000-01-01T00:00:00.000Z'
       WHERE id IN (?1, ?2, ?3)`
    )
    .bind(used.file.id, published.file.id, unused.file.id)
    .run();
  assert.equal(await sweepFiles(db, bucket, site.id), 1);
  assert.equal(await storedFile(db, unused.file.id), null);
  assert.equal(objects.has(fileKey(unused.file.id)), false);
  for (const kept of [used, published, fresh])
    assert.ok(await storedFile(db, kept.file.id));
});
