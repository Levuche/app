-- A creator's sites, pages, blocks, layouts and published versions.
-- Accounts, workspaces, names, emails and payments stay in Buildbase: rows
-- here hold only Buildbase ids. How it fits together: docs/DATABASE.md.

-- One creator site, owned by one Buildbase workspace.
CREATE TABLE sites (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  -- unpublished: never published. live: a version is live. offline: taken
  -- down by the creator. paused: taken down by the Levuche team. deleted:
  -- gone, its handle held for a while, then freed.
  status TEXT NOT NULL DEFAULT 'unpublished'
    CHECK (status IN ('unpublished', 'live', 'offline', 'paused', 'deleted')),
  -- The version visitors see, while live.
  live_version INTEGER,
  -- Logo, accent colour and fonts (#3).
  theme TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(theme)),
  -- When the draft last changed, to tell "live with draft changes".
  draft_changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX sites_by_workspace ON sites (workspace_id);

-- Site addresses on levuche.page. A site's own handle is kind 'site'; an
-- old one is 'held' until free_at, so links keep working and nobody takes
-- it at once; 'reserved' names belong to no site.
CREATE TABLE handles (
  handle TEXT PRIMARY KEY CHECK (handle = lower(handle)),
  site_id TEXT REFERENCES sites (id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('site', 'held', 'reserved')),
  free_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((kind = 'reserved') = (site_id IS NULL))
);
-- One current handle per site.
CREATE UNIQUE INDEX handles_one_per_site ON handles (site_id) WHERE kind = 'site';

-- A site's pages, as drafts. Whether a page is live comes from the live
-- version; scheduling comes later (#34).
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  -- The address after the handle: '' for the home page's own address.
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_home INTEGER NOT NULL DEFAULT 0 CHECK (is_home IN (0, 1)),
  -- Link only: not in the menu and not indexed.
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  -- Gone from the site at the next publish.
  removed INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1)),
  -- How the page is framed: 'beside' or 'column' (src/lib/page-layout.ts).
  frame TEXT NOT NULL DEFAULT 'beside' CHECK (frame IN ('beside', 'column')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (site_id, path)
);
CREATE UNIQUE INDEX pages_one_home ON pages (site_id) WHERE is_home = 1;

-- The blocks on a page: a @levuche/ui block type and its settings.
CREATE TABLE blocks (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES pages (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  props TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(props)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX blocks_by_page ON blocks (page_id);

-- Where each block sits on the 10-column grid, per screen: a GridLayout,
-- [{ i, x, y, w, h }] with i a block id (@levuche/ui). A missing screen is
-- drawn from the default arrangement.
CREATE TABLE layouts (
  page_id TEXT NOT NULL REFERENCES pages (id) ON DELETE CASCADE,
  screen TEXT NOT NULL CHECK (screen IN ('phone', 'tablet', 'desktop')),
  items TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(items)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (page_id, screen)
);

-- Each publish: the whole site as published, numbered from 1. Rolling back
-- makes an older number live again; the draft stays as it is.
CREATE TABLE versions (
  site_id TEXT NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),
  note TEXT,
  -- The Buildbase user who published it.
  published_by TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (site_id, number)
);

-- Any change to a page, its blocks or its layouts marks the site's draft as
-- changed, so "live with draft changes" never rests on each write
-- remembering to.
CREATE TRIGGER pages_after_insert AFTER INSERT ON pages BEGIN
  UPDATE sites SET draft_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.site_id;
END;
CREATE TRIGGER pages_after_update AFTER UPDATE ON pages BEGIN
  UPDATE sites SET draft_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.site_id;
END;
CREATE TRIGGER pages_after_delete AFTER DELETE ON pages BEGIN
  UPDATE sites SET draft_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = OLD.site_id;
END;
CREATE TRIGGER blocks_after_insert AFTER INSERT ON blocks BEGIN
  UPDATE sites SET draft_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = (SELECT site_id FROM pages WHERE id = NEW.page_id);
END;
CREATE TRIGGER blocks_after_update AFTER UPDATE ON blocks BEGIN
  UPDATE sites SET draft_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = (SELECT site_id FROM pages WHERE id = NEW.page_id);
END;
CREATE TRIGGER blocks_after_delete AFTER DELETE ON blocks BEGIN
  UPDATE sites SET draft_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = (SELECT site_id FROM pages WHERE id = OLD.page_id);
END;
CREATE TRIGGER layouts_after_insert AFTER INSERT ON layouts BEGIN
  UPDATE sites SET draft_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = (SELECT site_id FROM pages WHERE id = NEW.page_id);
END;
CREATE TRIGGER layouts_after_update AFTER UPDATE ON layouts BEGIN
  UPDATE sites SET draft_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = (SELECT site_id FROM pages WHERE id = NEW.page_id);
END;
CREATE TRIGGER layouts_after_delete AFTER DELETE ON layouts BEGIN
  UPDATE sites SET draft_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = (SELECT site_id FROM pages WHERE id = OLD.page_id);
END;
