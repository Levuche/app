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
  /** When the live version was published; null before the first publish. */
  livePublishedAt: string | null;
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
  s.draft_changed_at AS draftChangedAt, s.created_at AS createdAt,
  (SELECT v.published_at FROM versions v WHERE v.site_id = s.id
   AND v.number = s.live_version) AS livePublishedAt
  FROM sites s JOIN handles h ON h.site_id = s.id AND h.kind = 'site'
  WHERE s.workspace_id = ?1`;

const OWN_SITE = 'site_id IN (SELECT id FROM sites WHERE workspace_id = ?1)';

/** The most blocks one page can hold. */
export const MAX_BLOCKS = 60;

/** One page of a site as it's published: its settings, blocks and layouts. */
export interface PageSnapshot extends Pick<
  Page,
  'id' | 'path' | 'title' | 'frame' | 'hidden'
> {
  blocks: Pick<Block, 'id' | 'type' | 'props'>[];
  /** The creator's own grid arrangements, by screen, where they saved any. */
  layouts: Record<string, unknown>;
}

/** A whole site, frozen: what a version holds and what the draft is now. */
export interface SiteSnapshot {
  theme: Record<string, unknown>;
  pages: PageSnapshot[];
}

export interface VersionInfo {
  number: number;
  note: string | null;
  /** The Buildbase user who published it. */
  publishedBy: string;
  publishedAt: string;
}

/** True while the draft differs from what visitors see (or nothing is live). */
export const hasDraftChanges = (site: Site) =>
  !site.livePublishedAt || site.draftChangedAt > site.livePublishedAt;

/** Sites a version can be published to or made live on. */
const PUBLISHABLE = "('unpublished', 'live', 'offline')";

/** A new preview token: 32 random bytes, as letters and digits. */
const newToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
};

/** Reads a site's draft: every page not removed, its blocks and layouts. */
async function readDraft(
  db: D1Database,
  siteId: string
): Promise<SiteSnapshot | null> {
  const site = await db
    .prepare('SELECT theme FROM sites WHERE id = ?1')
    .bind(siteId)
    .first<{ theme: string }>();
  if (!site) return null;
  const [pages, blocks, layouts] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT id, path, title, frame, hidden FROM pages
         WHERE site_id = ?1 AND removed = 0 ORDER BY position`
      )
      .bind(siteId),
    db
      .prepare(
        `SELECT b.id, b.type, b.props, b.page_id AS pageId FROM blocks b
         JOIN pages p ON p.id = b.page_id
         WHERE p.site_id = ?1 AND p.removed = 0
         ORDER BY b.position, b.created_at`
      )
      .bind(siteId),
    db
      .prepare(
        `SELECT l.page_id AS pageId, l.screen, l.items FROM layouts l
         JOIN pages p ON p.id = l.page_id WHERE p.site_id = ?1`
      )
      .bind(siteId),
  ]);
  return {
    theme: JSON.parse(site.theme),
    pages: (
      pages.results as unknown as (Omit<PageSnapshot, 'hidden'> & {
        hidden: 0 | 1;
      })[]
    ).map((page) => ({
      id: page.id,
      path: page.path,
      title: page.title,
      frame: page.frame,
      hidden: page.hidden === 1,
      blocks: (
        blocks.results as unknown as {
          id: string;
          type: string;
          props: string;
          pageId: string;
        }[]
      )
        .filter((block) => block.pageId === page.id)
        .map(({ id, type, props }) => ({ id, type, props: JSON.parse(props) })),
      layouts: Object.fromEntries(
        (
          layouts.results as unknown as {
            pageId: string;
            screen: string;
            items: string;
          }[]
        )
          .filter((layout) => layout.pageId === page.id)
          .map((layout) => [layout.screen, JSON.parse(layout.items)])
      ),
    })),
  };
}

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

    /** The site's draft as it would be published; null for another's site. */
    async draft(siteId: string) {
      return (await get(siteId)) ? readDraft(db, siteId) : null;
    },

    /**
     * Copies the whole draft into the next numbered version and makes it the
     * live one. An offline site stays offline, with the new version ready
     * for when it's put back. Null when the site isn't this workspace's or
     * can't be published (paused or deleted). Two publishes at once each
     * get their own number.
     */
    async publish(
      siteId: string,
      publishedBy: string,
      note: string | null
    ): Promise<number | null> {
      for (let attempt = 0; attempt < 3; attempt++) {
        const site = await get(siteId);
        if (!site || !['unpublished', 'live', 'offline'].includes(site.status))
          return null;
        const snapshot = await readDraft(db, siteId);
        if (!snapshot) return null;
        const row = await db
          .prepare(
            'SELECT coalesce(max(number), 0) + 1 AS next FROM versions WHERE site_id = ?1'
          )
          .bind(siteId)
          .first<{ next: number }>();
        const number = row?.next ?? 1;
        try {
          const [inserted] = await db.batch([
            db
              .prepare(
                `INSERT INTO versions (site_id, number, snapshot, note, published_by)
                 SELECT id, ?3, ?4, ?5, ?6 FROM sites
                 WHERE id = ?2 AND workspace_id = ?1 AND status IN ${PUBLISHABLE}`
              )
              .bind(
                workspaceId,
                siteId,
                number,
                JSON.stringify(snapshot),
                note,
                publishedBy
              ),
            db
              .prepare(
                `UPDATE sites SET live_version = ?3,
                 status = CASE status WHEN 'offline' THEN 'offline' ELSE 'live' END,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?2 AND workspace_id = ?1 AND status IN ${PUBLISHABLE}
                 AND EXISTS (SELECT 1 FROM versions WHERE site_id = ?2 AND number = ?3)`
              )
              .bind(workspaceId, siteId, number),
          ]);
          return inserted.meta.changes > 0 ? number : null;
        } catch (error) {
          // Someone else took this number first: try the next one.
          if (!/UNIQUE constraint failed: versions/.test(String(error)))
            throw error;
        }
      }
      throw new Error('Too many publishes at once. Try again.');
    },

    /** The site's versions, newest first; none for another's site. */
    versions: async (siteId: string): Promise<VersionInfo[]> =>
      (
        await db
          .prepare(
            `SELECT v.number, v.note, v.published_by AS publishedBy,
             v.published_at AS publishedAt FROM versions v
             JOIN sites s ON s.id = v.site_id
             WHERE v.site_id = ?2 AND s.workspace_id = ?1
             ORDER BY v.number DESC`
          )
          .bind(workspaceId, siteId)
          .all<VersionInfo>()
      ).results,

    /**
     * Makes an older (or newer) version the live one. The draft stays as it
     * is. False when there's no such version or the site can't change.
     */
    async rollback(siteId: string, number: number) {
      const { meta } = await db
        .prepare(
          `UPDATE sites SET live_version = ?3,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?2 AND workspace_id = ?1 AND status IN ('live', 'offline')
           AND EXISTS (SELECT 1 FROM versions WHERE site_id = ?2 AND number = ?3)`
        )
        .bind(workspaceId, siteId, number)
        .run();
      return meta.changes > 0;
    },

    /** The site's private preview token, or null while the link is off. */
    async previewToken(siteId: string) {
      const row = await db
        .prepare(
          'SELECT preview_token AS token FROM sites WHERE id = ?2 AND workspace_id = ?1'
        )
        .bind(workspaceId, siteId)
        .first<{ token: string | null }>();
      return row?.token ?? null;
    },

    /**
     * Turns the private preview link on (with a new token, so an old link
     * stays dead) or off. Answers the new token, or null.
     */
    async setPreview(siteId: string, on: boolean) {
      const token = on ? newToken() : null;
      await db
        .prepare(
          'UPDATE sites SET preview_token = ?3 WHERE id = ?2 AND workspace_id = ?1'
        )
        .bind(workspaceId, siteId, token)
        .run();
      return token;
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

/**
 * The draft behind a private preview link, for /draft/<token>, which
 * anyone with the link can open. Like takenHandles, this one read isn't kept
 * to one workspace: the token is the key. Null for an unknown token and
 * for a site that's paused or deleted.
 */
export async function draftByPreviewToken(
  db: D1Database,
  token: string
): Promise<{ handle: string; draft: SiteSnapshot } | null> {
  if (!/^[0-9a-z]{64}$/.test(token)) return null;
  const site = await db
    .prepare(
      `SELECT s.id, h.handle FROM sites s
       JOIN handles h ON h.site_id = s.id AND h.kind = 'site'
       WHERE s.preview_token = ?1 AND s.status NOT IN ('paused', 'deleted')`
    )
    .bind(token)
    .first<{ id: string; handle: string }>();
  if (!site) return null;
  const draft = await readDraft(db, site.id);
  return draft && { handle: site.handle, draft };
}
