import {
  CreatorTheme,
  SiteGrid,
  SitePage,
  type PageLayouts,
  type SiteGridBlock,
  type SiteTheme,
} from '@levuche/ui';
import { BackToTop } from '@/components/back-to-top';
import { besideLayouts, isSideBlock, type PageFrame } from '@/lib/page-layout';

/** The id of a creator page's <main>, where "Back to top" takes the visitor. */
export const PAGE_TOP_ID = 'top';

/**
 * A creator's page: their blocks, in their theme, in the frame they picked.
 *
 * - beside: the 10-column grid from @levuche/ui. On a tablet and a desktop
 *   the profile column sits on the left and stays in view; on a phone
 *   everything stacks. `layouts` are the creator's own arrangements, where
 *   they saved any.
 * - column: one centred column on every screen, in the order of `blocks`.
 *
 * Either way, screen readers and the Tab key follow the order of `blocks`,
 * and a "Back to top" button shows up once the visitor has scrolled.
 */
export function CreatorPage({
  blocks,
  frame,
  theme,
  layouts,
  preview = false,
}: {
  blocks: SiteGridBlock[];
  frame: PageFrame;
  theme?: SiteTheme;
  layouts?: PageLayouts;
  /**
   * Drawn inside the editor: the page is a part of the editor's own page,
   * so it isn't the <main> and has no "Back to top".
   */
  preview?: boolean;
}) {
  return (
    <CreatorTheme
      theme={theme}
      className="min-h-dvh px-4 py-6 sm:px-6 sm:py-10"
    >
      {frame === 'column' ? (
        <OneColumn blocks={blocks} preview={preview} />
      ) : (
        <BesideGrid blocks={blocks} layouts={layouts} preview={preview} />
      )}
      {preview ? null : <BackToTop targetId={PAGE_TOP_ID} />}
    </CreatorTheme>
  );
}

function OneColumn({
  blocks,
  preview,
}: {
  blocks: SiteGridBlock[];
  preview: boolean;
}) {
  return (
    <SitePage
      {...(preview
        ? { as: 'div' as const }
        : { as: 'main' as const, id: PAGE_TOP_ID, tabIndex: -1 })}
      data-frame="column"
    >
      {blocks.map((block) => (
        <div
          key={block.id}
          data-page-block={block.id}
          className="flex min-w-0 flex-col"
        >
          {block.children}
        </div>
      ))}
    </SitePage>
  );
}

function BesideGrid({
  blocks,
  layouts,
  preview,
}: {
  blocks: SiteGridBlock[];
  layouts?: PageLayouts;
  preview: boolean;
}) {
  // The side column (the profile) stays in view on a tablet and a desktop.
  const placed = blocks.map((block) => ({
    ...block,
    sticky: block.sticky ?? isSideBlock(block),
  }));
  const specs = blocks.map(({ id, kind, side }) => ({ i: id, kind, side }));
  return (
    <SiteGrid
      {...(preview
        ? { as: 'div' as const }
        : { as: 'main' as const, id: PAGE_TOP_ID, tabIndex: -1 })}
      data-frame="beside"
      blocks={placed}
      layouts={besideLayouts(specs, layouts)}
    />
  );
}
