/*
 * How a creator's page is framed, and the grid arrangement each frame starts
 * with. Plain data and functions, so they run on the server, in the editor
 * and in tests.
 *
 * The arrangements themselves are { i, x, y, w, h } items on the 10-column
 * grid from @levuche/ui. Once the editor saves a creator's own arrangement
 * for a screen, that one is used instead.
 */
import {
  GRID_COLUMNS,
  GRID_SCREENS,
  defaultLayout,
  type GridBlockSpec,
  type GridLayout,
  type PageLayouts,
} from '@levuche/ui';

/**
 * The frames a creator can pick for their page:
 *
 * - beside: on a tablet and a desktop, the profile sits in a column on the
 *   left and stays in view while the blocks beside it, in a grid, scroll
 *   past. On a phone everything is one column.
 * - column: every block one under the other in a single centred column, on
 *   every screen.
 */
export const PAGE_FRAMES = ['beside', 'column'] as const;
export type PageFrame = (typeof PAGE_FRAMES)[number];

/** The frame a new page starts with. */
export const DEFAULT_PAGE_FRAME: PageFrame = 'beside';

export function isPageFrame(value: unknown): value is PageFrame {
  return (PAGE_FRAMES as readonly unknown[]).includes(value);
}

/** A frame from a saved setting or an address; anything else is the default. */
export function readPageFrame(value: unknown): PageFrame {
  const first = Array.isArray(value) ? value[0] : value;
  return isPageFrame(first) ? first : DEFAULT_PAGE_FRAME;
}

/** Blocks in the side column: profiles, and any block marked `side`. */
export function isSideBlock(block: Pick<GridBlockSpec, 'kind' | 'side'>) {
  return block.side ?? block.kind === 'profile';
}

/**
 * Moves the side column to the left. The grid's own starting arrangement
 * puts it on the right on a desktop; this swaps the two columns and keeps
 * everything else (rows, sizes, which blocks pair up) as it was. A layout
 * whose side column is already on the left, or that has only one column,
 * comes back unchanged. Returns a new layout.
 */
export function sideFirst(
  layout: GridLayout,
  sideIds: ReadonlySet<string>,
  columns = GRID_COLUMNS
): GridLayout {
  const copy = layout.map((item) => ({ ...item }));
  const side = copy.filter((item) => sideIds.has(item.i));
  const main = copy.filter((item) => !sideIds.has(item.i));
  if (side.length === 0 || main.length === 0) return copy;

  const left = (items: GridLayout) => Math.min(...items.map((it) => it.x));
  const right = (items: GridLayout) =>
    Math.max(...items.map((it) => it.x + it.w));
  const sideLeft = left(side);
  const mainLeft = left(main);
  const sideRight = right(side);
  const mainRight = right(main);
  // Only a side column that sits wholly to the right of the rest moves.
  if (sideLeft < mainRight || sideRight > columns) return copy;

  for (const item of side) item.x += mainLeft - sideLeft;
  for (const item of main) item.x += sideRight - mainRight;
  return copy;
}

/**
 * The arrangement a page in the `beside` frame shows on each screen: the
 * creator's own where they saved one, otherwise the grid's starting one with
 * the side column on the left. A phone stacks everything in reading order.
 */
export function besideLayouts(
  blocks: GridBlockSpec[],
  saved: PageLayouts = {}
): PageLayouts {
  const sideIds = new Set(blocks.filter(isSideBlock).map((block) => block.i));
  const layouts: PageLayouts = {};
  for (const screen of GRID_SCREENS) {
    layouts[screen] =
      saved[screen] ?? sideFirst(defaultLayout(blocks, screen), sideIds);
  }
  return layouts;
}
