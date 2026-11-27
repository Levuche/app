'use client';

import { PreviewMode } from '@levuche/ui';
import { CreatorPage } from '@/components/creator-page';
import { pageBlocks } from '@/components/page-blocks';
import type { Block } from '@/lib/db';
import type { PageFrame } from '@/lib/page-layout';

/** The phone width the page is drawn at, the same as the editor's phone preview. */
const PHONE_WIDTH = 390;
/** The width inside the overview's 300px preview column, less its 2px border. */
const BOX_WIDTH = 296;
const BOX_HEIGHT = 516;
const SCALE = BOX_WIDTH / PHONE_WIDTH;

/**
 * A small look at the draft on a phone, on the overview, so a creator sees
 * their page without opening the editor. The page is drawn at a real phone's
 * width and scaled down to fit, so lines wrap as they do on a phone rather
 * than in the narrower column. It's only a picture: nothing in it can be
 * pressed or reached with the keyboard, and screen readers skip it (it's
 * inert and hidden from them).
 */
export function PagePreview({
  blocks,
  frame,
}: {
  blocks: Pick<Block, 'id' | 'type' | 'props'>[];
  frame: PageFrame;
}) {
  return (
    <div
      aria-hidden
      inert
      data-overview-preview
      className="border-lv-border relative h-[520px] w-[300px] overflow-hidden rounded-[28px] border-2 text-base"
    >
      <div
        className="origin-top-left"
        style={{
          width: PHONE_WIDTH,
          height: BOX_HEIGHT / SCALE,
          transform: `scale(${SCALE})`,
        }}
      >
        <PreviewMode>
          <CreatorPage blocks={pageBlocks(blocks)} frame={frame} preview />
        </PreviewMode>
      </div>
      <div className="from-lv-bg pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t to-transparent" />
    </div>
  );
}
