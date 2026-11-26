/*
 * The checks a site's draft passes before it's published (#21). Anything
 * listed here shows as "Needs a fix", with a link to the block in the
 * editor, and publishing waits until the list is empty.
 */
import { blockPanel, blockProblems } from './blocks';
import type { SiteSnapshot } from './db';

export interface NeedsFix {
  /** The block to fix, or null for the page as a whole. */
  blockId: string | null;
  /** The block's name in the editor, or the page's title. */
  label: string;
  problems: string[];
}

export function publishProblems(draft: SiteSnapshot): NeedsFix[] {
  const fixes: NeedsFix[] = [];
  for (const page of draft.pages) {
    for (const block of page.blocks) {
      const problems = blockProblems(block.type, block.props);
      if (problems.length)
        fixes.push({
          blockId: block.id,
          label: blockPanel(block.type)?.label ?? block.type,
          problems,
        });
    }
    if (page.blocks.length === 0)
      fixes.push({
        blockId: null,
        label: page.title,
        problems: ['Add at least one block to your page.'],
      });
  }
  return fixes;
}
