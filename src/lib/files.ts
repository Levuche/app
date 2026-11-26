/*
 * Pictures a site keeps (#24): the rows in D1 (migrations/0005_files.sql)
 * and the bytes in R2. An upload goes in two steps. The editor asks for an
 * upload address (startUpload), which checks the type, the size and the
 * site's storage; the browser then sends the picture straight to that
 * address (src/app/api/uploads/[token]/route.ts, finishUpload), which reads
 * and cleans the bytes before keeping them. Pictures no draft, version or
 * theme uses any more are removed (sweepFiles).
 *
 * The database and the bucket are passed in, so this runs in tests too.
 */
import type { D1Database } from '@cloudflare/workers-types';
import {
  isPictureType,
  MAX_PICTURE_BYTES,
  MAX_SIDE,
  readPicture,
  SITE_STORAGE_BYTES,
  stripPictureData,
  type PictureType,
} from './pictures.ts';

/** The parts of an R2 bucket used here. */
export interface FileBucket {
  put(
    key: string,
    value: Uint8Array,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream;
    size: number;
  } | null>;
  delete(keys: string | string[]): Promise<void>;
}

/** How long an upload address works. */
export const UPLOAD_MINUTES = 10;

/** How long an unused picture is kept, so one being chosen isn't removed. */
export const KEEP_UNUSED_MINUTES = 60;

export const fileKey = (id: string) => `files/${id}`;

/** The address a picture is shown at, under the app's own address. */
export const fileUrl = (appUrl: string, id: string) =>
  `${appUrl.replace(/\/$/, '')}/files/${id}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isFileId = (id: string) => UUID.test(id);

const isoIn = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

async function sha256(text: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}

/** A new upload token: 32 random bytes, as hex. */
const newToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');

/**
 * The bytes a site holds or has been promised: its pictures, and uploads
 * that may still arrive.
 */
export async function storageUsed(db: D1Database, siteId: string) {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(bytes), 0) FROM files WHERE site_id = ?1) +
         (SELECT COALESCE(SUM(bytes), 0) FROM uploads
          WHERE site_id = ?1 AND expires_at > ?2) AS used`
    )
    .bind(siteId, new Date().toISOString())
    .first<{ used: number }>();
  return row?.used ?? 0;
}

export type StartResult =
  { token: string } | { error: 'wrong-type' | 'too-big' | 'full' };

/**
 * An upload address for one picture of `type` and `bytes`, if the site has
 * room for it. Only the token's hash is kept.
 */
export async function startUpload(
  db: D1Database,
  upload: { siteId: string; type: unknown; bytes: unknown; by: string }
): Promise<StartResult> {
  if (!isPictureType(upload.type)) return { error: 'wrong-type' };
  const bytes = Number(upload.bytes);
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_PICTURE_BYTES)
    return { error: 'too-big' };
  if ((await storageUsed(db, upload.siteId)) + bytes > SITE_STORAGE_BYTES)
    return { error: 'full' };
  const token = newToken();
  await db
    .prepare(
      `INSERT INTO uploads (token_hash, site_id, type, bytes, uploaded_by, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    )
    .bind(
      await sha256(token),
      upload.siteId,
      upload.type,
      bytes,
      upload.by,
      isoIn(UPLOAD_MINUTES)
    )
    .run();
  return { token };
}

export interface StoredFile {
  id: string;
  siteId: string;
  type: PictureType;
  bytes: number;
  width: number;
  height: number;
}

export type FinishResult =
  | { file: StoredFile }
  | {
      error:
        'expired' | 'wrong-type' | 'too-big' | 'too-large' | 'broken' | 'full';
    };

/**
 * Keeps the picture sent to an upload address: once, before the address
 * runs out, only of the type and size it was given for, and only once its
 * camera and location data are out.
 */
export async function finishUpload(
  db: D1Database,
  bucket: FileBucket,
  token: string,
  sent: Uint8Array
): Promise<FinishResult> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { error: 'expired' };
  // Taking the row uses the address up, whatever happens next.
  const upload = await db
    .prepare(
      `DELETE FROM uploads WHERE token_hash = ?1 AND expires_at > ?2
       RETURNING site_id AS siteId, type, bytes, uploaded_by AS uploadedBy`
    )
    .bind(await sha256(token), new Date().toISOString())
    .first<{
      siteId: string;
      type: PictureType;
      bytes: number;
      uploadedBy: string;
    }>();
  if (!upload) return { error: 'expired' };
  if (
    sent.length === 0 ||
    sent.length > Math.min(upload.bytes, MAX_PICTURE_BYTES)
  )
    return { error: 'too-big' };

  const info = readPicture(sent);
  if (!info || info.type !== upload.type) return { error: 'wrong-type' };
  if (info.width < 1 || info.height < 1) return { error: 'broken' };
  if (info.width > MAX_SIDE || info.height > MAX_SIDE)
    return { error: 'too-large' };
  const clean = stripPictureData(sent, info.type);
  if (!clean) return { error: 'broken' };
  if (
    (await storageUsed(db, upload.siteId)) + clean.length >
    SITE_STORAGE_BYTES
  )
    return { error: 'full' };

  const id = crypto.randomUUID();
  await bucket.put(fileKey(id), clean, {
    httpMetadata: { contentType: info.type },
  });
  await db
    .prepare(
      `INSERT INTO files (id, site_id, type, bytes, width, height, uploaded_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
    .bind(
      id,
      upload.siteId,
      info.type,
      clean.length,
      info.width,
      info.height,
      upload.uploadedBy
    )
    .run();
  return {
    file: {
      id,
      siteId: upload.siteId,
      type: info.type,
      bytes: clean.length,
      width: info.width,
      height: info.height,
    },
  };
}

/** A kept picture, to show it: only one that still has its row. */
export async function storedFile(db: D1Database, id: string) {
  if (!isFileId(id)) return null;
  return db
    .prepare('SELECT id, type, bytes FROM files WHERE id = ?1')
    .bind(id)
    .first<{ id: string; type: PictureType; bytes: number }>();
}

/**
 * Removes a site's pictures that nothing uses: not its draft (on any page,
 * removed ones too, so a page brought back keeps its pictures), not any
 * published version, not its theme. Pictures newer than an hour stay, as
 * one may be between upload and save. Also clears its spent upload
 * addresses. Returns how many pictures went.
 */
export async function sweepFiles(
  db: D1Database,
  bucket: FileBucket,
  siteId: string
): Promise<number> {
  const now = new Date().toISOString();
  const before = new Date(
    Date.now() - KEEP_UNUSED_MINUTES * 60_000
  ).toISOString();
  const { results } = await db
    .prepare(
      `SELECT f.id FROM files f
       WHERE f.site_id = ?1 AND f.created_at < ?2
         AND NOT EXISTS (
           SELECT 1 FROM blocks b JOIN pages p ON p.id = b.page_id
           WHERE p.site_id = ?1 AND instr(b.props, f.id) > 0)
         AND NOT EXISTS (
           SELECT 1 FROM versions v
           WHERE v.site_id = ?1 AND instr(v.snapshot, f.id) > 0)
         AND NOT EXISTS (
           SELECT 1 FROM sites s WHERE s.id = ?1 AND instr(s.theme, f.id) > 0)`
    )
    .bind(siteId, before)
    .all<{ id: string }>();
  await db
    .prepare('DELETE FROM uploads WHERE site_id = ?1 AND expires_at <= ?2')
    .bind(siteId, now)
    .run();
  const ids = results.map((row) => row.id);
  if (ids.length === 0) return 0;
  await bucket.delete(ids.map(fileKey));
  await db.batch(
    ids.map((id) => db.prepare('DELETE FROM files WHERE id = ?1').bind(id))
  );
  return ids.length;
}
