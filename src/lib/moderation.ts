// Reports from visitors and the Levuche team's pauses (#33), in D1
// (migrations/0004_reports_and_pauses.sql). Unlike siteStore, the team's
// reads cross every site, so only the staff screens and the public report
// form call these, and the staff screens check isStaff first
// (src/lib/staff.ts). Creators read their own site's pause through
// pauseNotice and appeal through appeal, both kept to their workspace.
import type { D1Database } from '@cloudflare/workers-types';
import type { SiteSnapshot, SiteStatus } from './db';

export const REPORT_REASONS = {
  spam: 'Spam or a scam',
  impersonation: 'Pretending to be someone else',
  hate: 'Hate or harassment',
  adult: 'Adult content',
  copyright: 'Someone else’s copyrighted work',
  other: 'Something else',
} as const;

export type ReportReason = keyof typeof REPORT_REASONS;

export const isReportReason = (value: unknown): value is ReportReason =>
  typeof value === 'string' && Object.hasOwn(REPORT_REASONS, value);

/** How many reports one visitor can send in a day, across every site. */
export const REPORTS_PER_DAY = 10;
export const MAX_DETAILS = 1000;
export const MAX_NOTE = 2000;

const now = () => new Date().toISOString();
const dayAgo = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

/**
 * The key a report keeps for its visitor: a hash of the day and their
 * address, so the address itself is never stored and keys from different
 * days can't be matched up.
 */
export async function visitorKey(address: string, day = now().slice(0, 10)) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`levuche-report:${day}:${address}`)
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}

/** A site visitors can see now, which is the only kind they can report. */
export async function reportableSite(db: D1Database, handle: string) {
  return db
    .prepare(
      `SELECT s.id, h.handle, s.live_version AS liveVersion FROM handles h
       JOIN sites s ON s.id = h.site_id
       WHERE h.handle = ?1 AND h.kind = 'site' AND s.status = 'live'
       AND s.live_version IS NOT NULL`
    )
    .bind(handle)
    .first<{ id: string; handle: string; liveVersion: number }>();
}

export type ReportResult = 'sent' | 'again' | 'limited' | 'not-found';

/**
 * Files a visitor's report with a copy of the live version. One report per
 * site per visitor a day, and REPORTS_PER_DAY in all.
 */
export async function fileReport(
  db: D1Database,
  input: {
    handle: string;
    path: string;
    reason: ReportReason;
    details: string | null;
    visitor: string;
  }
): Promise<ReportResult> {
  const site = await reportableSite(db, input.handle);
  if (!site) return 'not-found';
  const since = dayAgo();
  const counts = await db
    .prepare(
      `SELECT count(*) AS total, sum(site_id = ?3) AS here FROM reports
       WHERE visitor = ?1 AND created_at > ?2`
    )
    .bind(input.visitor, since, site.id)
    .first<{ total: number; here: number | null }>();
  if ((counts?.here ?? 0) > 0) return 'again';
  if ((counts?.total ?? 0) >= REPORTS_PER_DAY) return 'limited';

  const { meta } = await db
    .prepare(
      `INSERT INTO reports (id, site_id, handle, path, reason, details, version, snapshot, visitor)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, v.number, v.snapshot, ?7 FROM versions v
       WHERE v.site_id = ?2 AND v.number = ?8`
    )
    .bind(
      crypto.randomUUID(),
      site.id,
      site.handle,
      input.path.slice(0, 200),
      input.reason,
      input.details?.slice(0, MAX_DETAILS) || null,
      input.visitor,
      site.liveVersion
    )
    .run();
  return meta.changes > 0 ? 'sent' : 'not-found';
}

export interface Report {
  id: string;
  siteId: string;
  handle: string;
  path: string;
  reason: ReportReason;
  details: string | null;
  version: number;
  createdAt: string;
}

export interface ReportedSite {
  siteId: string;
  workspaceId: string;
  handle: string;
  status: SiteStatus;
  reports: Report[];
}

/** Sites with open reports, the most reported first, for the staff screen. */
export async function openReports(db: D1Database): Promise<ReportedSite[]> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.site_id AS siteId, r.handle, r.path, r.reason, r.details,
       r.version, r.created_at AS createdAt, s.workspace_id AS workspaceId,
       s.status FROM reports r JOIN sites s ON s.id = r.site_id
       WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 500`
    )
    .all<Report & { workspaceId: string; status: SiteStatus }>();
  const bySite = new Map<string, ReportedSite>();
  for (const { workspaceId, status, ...report } of results) {
    const site = bySite.get(report.siteId) ?? {
      siteId: report.siteId,
      workspaceId,
      handle: report.handle,
      status,
      reports: [],
    };
    site.reports.push(report);
    bySite.set(report.siteId, site);
  }
  return [...bySite.values()].sort(
    (a, b) => b.reports.length - a.reports.length
  );
}

/** The copy of the site a report was made against. */
export async function reportCopy(db: D1Database, id: string) {
  const row = await db
    .prepare(
      `SELECT handle, path, reason, version, created_at AS createdAt, snapshot
       FROM reports WHERE id = ?1`
    )
    .bind(id)
    .first<{
      handle: string;
      path: string;
      reason: ReportReason;
      version: number;
      createdAt: string;
      snapshot: string;
    }>();
  return row
    ? { ...row, snapshot: JSON.parse(row.snapshot) as SiteSnapshot }
    : null;
}

const PAUSABLE = `('unpublished', 'live', 'offline')`;

/**
 * Pauses a site: visitors see that it isn't available and its creator sees
 * why. Closes its open reports and logs the pause, with the status that
 * unpausing gives back. False when the site is already paused or deleted.
 */
export async function pauseSite(
  db: D1Database,
  input: {
    siteId: string;
    reason: ReportReason;
    note: string | null;
    actor: string;
  }
) {
  const site = await db
    .prepare('SELECT status FROM sites WHERE id = ?1')
    .bind(input.siteId)
    .first<{ status: SiteStatus }>();
  if (!site || !['unpublished', 'live', 'offline'].includes(site.status))
    return false;
  const [paused] = await db.batch([
    db
      .prepare(
        `UPDATE sites SET status = 'paused',
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1 AND status = ?2 AND status IN ${PAUSABLE}`
      )
      .bind(input.siteId, site.status),
    db
      .prepare(
        `INSERT INTO moderation_log (id, site_id, action, reason, note, from_status, actor)
         SELECT ?1, ?2, 'pause', ?3, ?4, ?5, ?6 WHERE changes() > 0`
      )
      .bind(
        crypto.randomUUID(),
        input.siteId,
        input.reason,
        input.note?.slice(0, MAX_NOTE) || null,
        site.status,
        input.actor
      ),
    db
      .prepare(
        `UPDATE reports SET status = 'closed' WHERE site_id = ?1 AND status = 'open'
         AND EXISTS (SELECT 1 FROM sites WHERE id = ?1 AND status = 'paused')`
      )
      .bind(input.siteId),
  ]);
  return paused.meta.changes > 0;
}

/**
 * Unpauses a site, back to the status it had when it was paused, and logs
 * it. False when the site isn't paused.
 */
export async function unpauseSite(
  db: D1Database,
  input: { siteId: string; note: string | null; actor: string }
) {
  const last = await db
    .prepare(
      `SELECT from_status AS fromStatus FROM moderation_log
       WHERE site_id = ?1 AND action = 'pause' ORDER BY at DESC, rowid DESC LIMIT 1`
    )
    .bind(input.siteId)
    .first<{ fromStatus: SiteStatus | null }>();
  const back =
    last?.fromStatus &&
    ['unpublished', 'live', 'offline'].includes(last.fromStatus)
      ? last.fromStatus
      : 'unpublished';
  const [unpaused] = await db.batch([
    db
      .prepare(
        `UPDATE sites SET status = CASE
           WHEN ?2 IN ('live', 'offline') AND live_version IS NULL THEN 'unpublished'
           ELSE ?2 END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1 AND status = 'paused'`
      )
      .bind(input.siteId, back),
    db
      .prepare(
        `INSERT INTO moderation_log (id, site_id, action, note, actor)
         SELECT ?1, ?2, 'unpause', ?3, ?4 WHERE changes() > 0`
      )
      .bind(
        crypto.randomUUID(),
        input.siteId,
        input.note?.slice(0, MAX_NOTE) || null,
        input.actor
      ),
  ]);
  return unpaused.meta.changes > 0;
}

/** Closes a site's open reports without pausing it, and logs that. */
export async function closeReports(
  db: D1Database,
  input: { siteId: string; note: string | null; actor: string }
) {
  const [closed] = await db.batch([
    db
      .prepare(
        `UPDATE reports SET status = 'closed' WHERE site_id = ?1 AND status = 'open'`
      )
      .bind(input.siteId),
    db
      .prepare(
        `INSERT INTO moderation_log (id, site_id, action, note, actor)
         SELECT ?1, ?2, 'close', ?3, ?4 WHERE changes() > 0`
      )
      .bind(
        crypto.randomUUID(),
        input.siteId,
        input.note?.slice(0, MAX_NOTE) || null,
        input.actor
      ),
  ]);
  return closed.meta.changes;
}

export interface PausedSite {
  siteId: string;
  workspaceId: string;
  handle: string;
  reason: ReportReason | null;
  note: string | null;
  pausedAt: string | null;
  appeal: { note: string; at: string } | null;
}

/** Every paused site, with why and any appeal since, for the staff screen. */
export async function pausedSites(db: D1Database): Promise<PausedSite[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id AS siteId, s.workspace_id AS workspaceId, h.handle,
       p.reason, p.note, p.at AS pausedAt, a.note AS appealNote, a.at AS appealAt
       FROM sites s JOIN handles h ON h.site_id = s.id AND h.kind = 'site'
       LEFT JOIN moderation_log p ON p.rowid = (SELECT rowid FROM moderation_log
         WHERE site_id = s.id AND action = 'pause' ORDER BY at DESC, rowid DESC LIMIT 1)
       LEFT JOIN moderation_log a ON a.rowid = (SELECT rowid FROM moderation_log
         WHERE site_id = s.id AND action = 'appeal' AND at >= p.at
         ORDER BY at DESC, rowid DESC LIMIT 1)
       WHERE s.status = 'paused' ORDER BY p.at DESC`
    )
    .all<
      Omit<PausedSite, 'appeal'> & {
        appealNote: string | null;
        appealAt: string | null;
      }
    >();
  return results.map(({ appealNote, appealAt, ...site }) => ({
    ...site,
    appeal: appealNote && appealAt ? { note: appealNote, at: appealAt } : null,
  }));
}

export interface LogEntry {
  id: string;
  handle: string;
  action: 'pause' | 'unpause' | 'close' | 'appeal';
  reason: ReportReason | null;
  note: string | null;
  actor: string;
  at: string;
}

/** The latest moderation actions across every site, newest first. */
export async function moderationLog(db: D1Database, limit = 50) {
  const { results } = await db
    .prepare(
      `SELECT m.id, coalesce(h.handle, '') AS handle, m.action, m.reason, m.note,
       m.actor, m.at FROM moderation_log m
       LEFT JOIN handles h ON h.site_id = m.site_id AND h.kind = 'site'
       ORDER BY m.at DESC, m.rowid DESC LIMIT ?1`
    )
    .bind(limit)
    .all<LogEntry>();
  return results;
}

/**
 * Why a workspace's site is paused, for its creator: the reason, the
 * team's note, when, and their own appeal since, if any. Null when the site
 * isn't paused or isn't this workspace's.
 */
export async function pauseNotice(
  db: D1Database,
  workspaceId: string,
  siteId: string
) {
  const site = await db
    .prepare(
      `SELECT 1 AS ok FROM sites WHERE id = ?1 AND workspace_id = ?2 AND status = 'paused'`
    )
    .bind(siteId, workspaceId)
    .first();
  if (!site) return null;
  const [paused] = (await pausedSites(db)).filter(
    (one) => one.siteId === siteId
  );
  return paused
    ? {
        reason: paused.reason,
        note: paused.note,
        pausedAt: paused.pausedAt,
        appealedAt: paused.appeal?.at ?? null,
      }
    : { reason: null, note: null, pausedAt: null, appealedAt: null };
}

/**
 * A creator's request to look at a paused site again. One open appeal per
 * pause. False when the site isn't paused, isn't this workspace's, or was
 * already appealed since its pause.
 */
export async function appeal(
  db: D1Database,
  input: { workspaceId: string; siteId: string; note: string; actor: string }
) {
  const notice = await pauseNotice(db, input.workspaceId, input.siteId);
  if (!notice || notice.appealedAt) return false;
  const note = input.note.trim().slice(0, MAX_NOTE);
  if (!note) return false;
  await db
    .prepare(
      `INSERT INTO moderation_log (id, site_id, action, note, actor)
       VALUES (?1, ?2, 'appeal', ?3, ?4)`
    )
    .bind(crypto.randomUUID(), input.siteId, note, input.actor)
    .run();
  return true;
}
