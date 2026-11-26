/**
 * The starting layout every new site gets (#18): the blocks its home page
 * opens with in the editor, as @levuche/ui block ids and their settings.
 * Lists start empty, so nothing made up ever goes live: until the creator
 * fills a block in, the editor asks for it and the live page leaves it out.
 * Where each block sits on a phone, a tablet and a desktop comes from the
 * grid's own arrangement until the creator moves something.
 */
export interface StarterBlock {
  type: string;
  props: Record<string, unknown>;
}

export function starterBlocks(siteName: string): StarterBlock[] {
  return [
    { type: 'creator-header', props: { name: siteName } },
    { type: 'social-icons', props: { links: [] } },
    { type: 'link-list', props: { links: [] } },
  ];
}
