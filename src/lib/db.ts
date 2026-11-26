// A creator's sites in D1 (tables in migrations/, explained in
// docs/DATABASE.md). Every read and change goes through siteStore, which
// only ever sees one Buildbase workspace's rows, so one creator can't read
// or change another's.
import type { D1Database } from '@cloudflare/workers-types';
import type { PageFrame } from './page-layout';
import type { StarterBlock } from './starter';

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

export interface Block {
  id: string;
  /** A @levuche/ui block id, as 'link-list'. */
  type: string;
  /** Its settings, as the block's settings panel describes them. */
  props: Record<string, unknown>;
  /** Reading order on the page, from 0. */
  position: number;
}

type PageRow = Omit<Page, 'isHome' | 'hidden' | 'removed'> &
  Record<'isHome' | 'hidden' | 'removed', 0 | 1>;

const SITES = `SELECT s.id, h.handle, s.status, s.live_version AS liveVersion,
  s.draft_changed_at AS draftChangedAt, s.created_at AS createdAt
  FROM sites s JOIN handles h ON h.site_id = s.id AND h.kind = 'site'
  WHERE s.workspace_id = ?1`;

const OWN_SITE = 'site_id IN (SELECT id FROM sites WHERE workspace_id = ?1)';

/** The most blocks one page can hold. */
export const MAX_BLOCKS = 60;

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
     * handle rules) with a home page holding `blocks`, in that order. Null
     * when the handle is taken, held or reserved.
     */
    async create(handle: string, blocks: StarterBlock[] = []) {
      const id = crypto.randomUUID();
      const homeId = crypto.randomUUID();
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
            .bind(homeId, id),
          ...blocks.map((block, position) =>
            db
              .prepare(
                'INSERT INTO blocks (id, page_id, type, props, position) VALUES (?1, ?2, ?3, ?4, ?5)'
              )
              .bind(
                crypto.randomUUID(),
                homeId,
                block.type,
                JSON.stringify(block.props),
                position
              )
          ),
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

    /** A page's blocks in reading order; none for another workspace's page. */
    blocks: async (pageId: string): Promise<Block[]> =>
      (
        await db
          .prepare(
            `SELECT b.id, b.type, b.props, b.position FROM blocks b
             JOIN pages p ON p.id = b.page_id
             WHERE b.page_id = ?2 AND p.${OWN_SITE}
             ORDER BY b.position, b.created_at`
          )
          .bind(workspaceId, pageId)
          .all<Omit<Block, 'props'> & { props: string }>()
      ).results.map((row) => ({ ...row, props: JSON.parse(row.props) })),

    /** The page a block is on, when the block is this workspace's. */
    async blockPage(blockId: string) {
      const row = await db
        .prepare(
          `SELECT b.page_id AS pageId FROM blocks b
           JOIN pages p ON p.id = b.page_id
           WHERE b.id = ?2 AND p.${OWN_SITE}`
        )
        .bind(workspaceId, blockId)
        .first<{ pageId: string }>();
      return row?.pageId ?? null;
    },

    /**
     * Adds a block at the end of a page. Null when the page isn't this
     * workspace's or already holds MAX_BLOCKS.
     */
    async addBlock(
      pageId: string,
      type: string,
      props: Record<string, unknown>
    ): Promise<Block | null> {
      const id = crypto.randomUUID();
      const { meta } = await db
        .prepare(
          `INSERT INTO blocks (id, page_id, type, props, position)
           SELECT ?3, p.id, ?4, ?5, coalesce(
             (SELECT max(position) + 1 FROM blocks WHERE page_id = p.id), 0)
           FROM pages p WHERE p.id = ?2 AND p.${OWN_SITE}
           AND (SELECT count(*) FROM blocks WHERE page_id = p.id) < ?6`
        )
        .bind(workspaceId, pageId, id, type, JSON.stringify(props), MAX_BLOCKS)
        .run();
      if (meta.changes === 0) return null;
      return (await this.blocks(pageId)).find((b) => b.id === id) ?? null;
    },

    /** Replaces a block's settings. False when it isn't this workspace's. */
    async updateBlock(blockId: string, props: Record<string, unknown>) {
      const { meta } = await db
        .prepare(
          `UPDATE blocks SET props = ?3,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?2 AND page_id IN
             (SELECT id FROM pages WHERE ${OWN_SITE})`
        )
        .bind(workspaceId, blockId, JSON.stringify(props))
        .run();
      return meta.changes > 0;
    },

    /** Takes a block off its page. False when it isn't this workspace's. */
    async removeBlock(blockId: string) {
      const pageId = await this.blockPage(blockId);
      if (!pageId) return false;
      await db
        .prepare('DELETE FROM blocks WHERE id = ?1 AND page_id = ?2')
        .bind(blockId, pageId)
        .run();
      await this.orderBlocks(
        pageId,
        (await this.blocks(pageId)).map((b) => b.id)
      );
      return true;
    },

    /**
     * Moves a block to `to` in its page's reading order (from 0; clamped to
     * the page). False when it isn't this workspace's.
     */
    async moveBlock(blockId: string, to: number) {
      const pageId = await this.blockPage(blockId);
      if (!pageId) return false;
      const ids = (await this.blocks(pageId))
        .map((b) => b.id)
        .filter((id) => id !== blockId);
      const at = Math.max(0, Math.min(ids.length, Math.trunc(to)));
      ids.splice(at, 0, blockId);
      await this.orderBlocks(pageId, ids);
      return true;
    },

    /** Numbers a page's blocks 0, 1, 2… in the order of `ids`. */
    async orderBlocks(pageId: string, ids: string[]) {
      if (ids.length === 0) return;
      await db.batch(
        ids.map((id, position) =>
          db
            .prepare(
              `UPDATE blocks SET position = ?4 WHERE id = ?3 AND page_id = ?2
               AND page_id IN (SELECT id FROM pages WHERE ${OWN_SITE})
               AND position != ?4`
            )
            .bind(workspaceId, pageId, id, position)
        )
      );
    },

    /**
     * Takes a live site offline, or puts an offline one back live with the
     * version it had. Paused (by the Levuche team), unpublished and deleted
     * sites don't change. True when the site changed.
     */
    async setOffline(siteId: string, offline: boolean) {
      const { meta } = await db
        .prepare(
          `UPDATE sites SET status = ?3,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?2 AND workspace_id = ?1 AND status = ?4
           AND live_version IS NOT NULL`
        )
        .bind(
          workspaceId,
          siteId,
          offline ? 'offline' : 'live',
          offline ? 'live' : 'offline'
        )
        .run();
      return meta.changes > 0;
    },

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

/**
 * Which of `handles` are already in use: a site's, held after a site was
 * deleted, or reserved by the Levuche team. Handles are public addresses,
 * so this is the one read that isn't kept to one workspace; it returns
 * nothing else about the sites behind them.
 */
export async function takenHandles(
  db: D1Database,
  handles: string[]
): Promise<Set<string>> {
  if (handles.length === 0) return new Set();
  const { results } = await db
    .prepare(
      `SELECT handle FROM handles WHERE handle IN (${handles.map((_, i) => `?${i + 1}`).join(', ')})`
    )
    .bind(...handles)
    .all<{ handle: string }>();
  return new Set(results.map((row) => row.handle));
}
