// A creator's sites in D1 (tables in migrations/, explained in
// docs/DATABASE.md). Every read and change goes through siteStore, which
// only ever sees one Buildbase workspace's rows, so one creator can't read
// or change another's.
import type { D1Database } from '@cloudflare/workers-types';
import type { PageFrame } from './page-layout';

export type SiteStatus =
  'unpublished' | 'live' | 'offline' | 'paused' | 'deleted';

export interface Site {
  id: string;
  /** The address on levuche.page. */
  handle: string;
  status: SiteStatus;
  /** The version visitors see, while live. */
  liveVersion: number | null;
  /** Newer than the live version's publish time: live with draft changes. */
  draftChangedAt: string;
  createdAt: string;
}

export interface Page {
  id: string;
  /** The address after the handle: '' for the home page. */
  path: string;
  title: string;
  position: number;
  isHome: boolean;
  /** Link only: not in the menu and not indexed. */
  hidden: boolean;
  /** Gone from the site at the next publish. */
  removed: boolean;
  frame: PageFrame;
}

type PageRow = Omit<Page, 'isHome' | 'hidden' | 'removed'> &
  Record<'isHome' | 'hidden' | 'removed', 0 | 1>;

const SITES = `SELECT s.id, h.handle, s.status, s.live_version AS liveVersion,
  s.draft_changed_at AS draftChangedAt, s.created_at AS createdAt
  FROM sites s JOIN handles h ON h.site_id = s.id AND h.kind = 'site'
  WHERE s.workspace_id = ?1`;

const OWN_SITE = 'site_id IN (SELECT id FROM sites WHERE workspace_id = ?1)';

export function siteStore(
  db: D1Database,
  { workspaceId }: { workspaceId: string }
) {
  const get = (siteId: string) =>
    db
      .prepare(`${SITES} AND s.id = ?2`)
      .bind(workspaceId, siteId)
      .first<Site>();

  return {
    get,

    /** The workspace's sites, oldest first, leaving out deleted ones. */
    list: async () =>
      (
        await db
          .prepare(`${SITES} AND s.status != 'deleted' ORDER BY s.created_at`)
          .bind(workspaceId)
          .all<Site>()
      ).results,

    /**
     * A new, unpublished site at `handle` (already checked against the
     * handle rules) with an empty home page. Null when the handle is taken,
     * held or reserved.
     */
    async create(handle: string) {
      const id = crypto.randomUUID();
      try {
        await db.batch([
          db
            .prepare('INSERT INTO sites (id, workspace_id) VALUES (?1, ?2)')
            .bind(id, workspaceId),
          db
            .prepare(
              "INSERT INTO handles (handle, site_id, kind) VALUES (?1, ?2, 'site')"
            )
            .bind(handle, id),
          db
            .prepare(
              "INSERT INTO pages (id, site_id, path, title, position, is_home) VALUES (?1, ?2, '', 'Home', 0, 1)"
            )
            .bind(crypto.randomUUID(), id),
        ]);
      } catch (error) {
        if (/UNIQUE constraint failed: handles\.handle/.test(String(error)))
          return null;
        throw error;
      }
      return get(id);
    },

    /** A site's pages in menu order; none for another workspace's site. */
    pages: async (siteId: string): Promise<Page[]> =>
      (
        await db
          .prepare(
            `SELECT id, path, title, position, is_home AS isHome, hidden,
             removed, frame FROM pages WHERE ${OWN_SITE} AND site_id = ?2
             ORDER BY position`
          )
          .bind(workspaceId, siteId)
          .all<PageRow>()
      ).results.map((row) => ({
        ...row,
        isHome: row.isHome === 1,
        hidden: row.hidden === 1,
        removed: row.removed === 1,
      })),

    /** Changes a page's draft. False when it isn't this workspace's page. */
    async updatePage(
      pageId: string,
      changes: Partial<Pick<Page, 'title' | 'hidden' | 'frame'>>
    ) {
      const { meta } = await db
        .prepare(
          `UPDATE pages SET title = coalesce(?3, title),
           hidden = coalesce(?4, hidden), frame = coalesce(?5, frame),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?2 AND ${OWN_SITE}`
        )
        .bind(
          workspaceId,
          pageId,
          changes.title ?? null,
          changes.hidden === undefined ? null : Number(changes.hidden),
          changes.frame ?? null
        )
        .run();
      return meta.changes > 0;
    },
  };
}
