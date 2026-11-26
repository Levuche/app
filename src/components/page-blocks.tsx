import {
  CameraIcon,
  CreatorHeader,
  EmailIcon,
  GlobeIcon,
  LinkList,
  SiteImage,
  SocialIcons,
  TextBlock,
  VideoIcon,
  type SiteGridBlock,
} from '@levuche/ui';
import type { ComponentProps, ReactNode } from 'react';
import { blockPanel, readyProps, type EditorBlockType } from '@/lib/blocks';
import type { Block } from '@/lib/db';

/** An icon that fits a link's address, for social icons and link rows. */
export function linkIcon(href: string, size = 20): ReactNode {
  const address = href.toLowerCase();
  if (address.startsWith('mailto:')) return <EmailIcon size={size} />;
  if (/instagram\.com|threads\.(net|com)|pinterest\./.test(address))
    return <CameraIcon size={size} />;
  if (/youtube\.com|youtu\.be|tiktok\.com|twitch\.tv|vimeo\.com/.test(address))
    return <VideoIcon size={size} />;
  return <GlobeIcon size={size} />;
}

const withIcons = <T extends { href: string }>(links: T[]) =>
  links.map((link) => ({ ...link, icon: linkIcon(link.href) }));

/** One block, drawn from what was checked by readyProps. */
function drawBlock(
  type: EditorBlockType,
  props: Record<string, unknown>,
  inEditor: boolean
) {
  switch (type) {
    case 'creator-header':
      // In the editor the page sits inside the editor's own headings.
      return (
        <CreatorHeader
          {...(props as ComponentProps<typeof CreatorHeader>)}
          headingAs={inEditor ? 'p' : 'h1'}
        />
      );
    case 'social-icons': {
      const p = props as ComponentProps<typeof SocialIcons>;
      return <SocialIcons {...p} links={withIcons(p.links)} />;
    }
    case 'link-list': {
      const p = props as ComponentProps<typeof LinkList>;
      return <LinkList {...p} links={withIcons(p.links)} />;
    }
    case 'text-block':
      return <TextBlock {...(props as ComponentProps<typeof TextBlock>)} />;
    case 'site-image':
      return <SiteImage {...(props as ComponentProps<typeof SiteImage>)} />;
  }
}

/**
 * A page's saved blocks as the grid draws them, in reading order. A block
 * that isn't filled in yet is left out, or, in the editor (`unfinished`),
 * drawn by that function instead, so the creator sees where it will go.
 */
export function pageBlocks(
  blocks: Pick<Block, 'id' | 'type' | 'props'>[],
  unfinished?: (block: { id: string; missing: string[] }) => ReactNode
): SiteGridBlock[] {
  return blocks.flatMap((block) => {
    const panel = blockPanel(block.type);
    if (!panel) return [];
    const { props, missing } = readyProps(block.type, block.props);
    if (missing.length && !unfinished) return [];
    return [
      {
        id: block.id,
        kind: panel.kind,
        children: missing.length
          ? unfinished?.({ id: block.id, missing })
          : drawBlock(
              block.type as EditorBlockType,
              props,
              Boolean(unfinished)
            ),
      },
    ];
  });
}
