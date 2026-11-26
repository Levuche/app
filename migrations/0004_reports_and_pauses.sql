-- Reports from visitors, and the Levuche team pausing a site (#33).
-- Reporters need no account: a report keeps only a daily key made from the
-- visitor's address (never the address itself), to limit how often one
-- visitor can report.

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  -- The handle and page the visitor reported, as they saw it.
  handle TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL CHECK (
    reason IN ('spam', 'impersonation', 'hate', 'adult', 'copyright', 'other')
  ),
  details TEXT CHECK (details IS NULL OR length(details) <= 1000),
  -- A copy of the live version at that moment, so the team sees what the
  -- visitor saw even after the creator publishes again.
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),
  -- sha256 of the day and the visitor's address.
  visitor TEXT NOT NULL,
  -- open until the team closes it, with or without a pause.
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX reports_open ON reports (status, created_at);
CREATE INDEX reports_by_visitor ON reports (visitor, created_at);

-- Every pause and unpause, every report the team closed, and every appeal
-- from a creator. Never changed or deleted by the app.
CREATE TABLE moderation_log (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('pause', 'unpause', 'close', 'appeal')),
  -- pause: one of the report reasons, which the creator sees.
  reason TEXT,
  -- pause: a note the creator sees; appeal: what the creator wrote;
  -- unpause and close: the team's own note.
  note TEXT CHECK (note IS NULL OR length(note) <= 2000),
  -- pause: the status the site had, which unpausing gives back.
  from_status TEXT,
  -- The Buildbase user id of who did it.
  actor TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX moderation_log_by_site ON moderation_log (site_id, at);
CREATE INDEX moderation_log_by_time ON moderation_log (at);
