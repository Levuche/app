-- The order of a page's blocks: what screen readers and the Tab key follow,
-- what a phone shows top to bottom, and where the one-column frame puts
-- each block. Counted from 0 within a page.
ALTER TABLE blocks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
CREATE INDEX blocks_in_order ON blocks (page_id, position);
