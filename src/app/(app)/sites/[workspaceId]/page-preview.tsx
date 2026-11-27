'use client';

import { PreviewMode } from '@levuche/ui';
import { CreatorPage } from '@/components/creator-page';
import { pageBlocks } from '@/components/page-blocks';
import type { Block } from '@/lib/db';
import type { PageFrame } from '@/lib/page-layout';

/**
 * A small look at the draft on a phone, on the overview, so a creator sees
 * their page without opening the editor. It's only a picture: nothing in it
 * can be pressed or reached with the keyboard, and screen readers skip it
 * (it's inert).
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
      inert
      data-overview-preview
      className="border-lv-border relative h-[520px] w-full overflow-hidden rounded-[28px] border-2 text-base"
    >
      <PreviewMode>
        <CreatorPage blocks={pageBlocks(blocks)} frame={frame} preview />
      </PreviewMode>
      <div className="from-lv-bg pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t to-transparent" />
    </div>
  );
}
