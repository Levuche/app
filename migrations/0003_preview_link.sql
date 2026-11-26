-- A private link to a site's draft (#21): /draft/<token> on the app, never
-- indexed. NULL while the creator has it turned off; turning it on again
-- makes a new token, so an old link stops working.
ALTER TABLE sites ADD COLUMN preview_token TEXT;
CREATE UNIQUE INDEX sites_by_preview_token ON sites (preview_token)
  WHERE preview_token IS NOT NULL;
