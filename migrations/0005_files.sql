-- Pictures creators upload for their pages (#24). The bytes are in R2 (the
-- FILES binding) under files/<id>; a row here says which site a picture
-- belongs to and how big it is, so each site has a storage limit. Files
-- that buyers pay for stay with Buildbase selling (#28), not here.
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  -- The Buildbase user who uploaded it.
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX files_by_site ON files (site_id, created_at);

-- Upload addresses: one per picture, for ten minutes, used once. Only a
-- hash of the address's token is kept.
CREATE TABLE uploads (
  token_hash TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image/jpeg', 'image/png', 'image/webp')),
  -- The size the browser said it would send; the upload can't be bigger.
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  uploaded_by TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX uploads_by_site ON uploads (site_id);
