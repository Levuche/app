'use server';

import { savedProps, isEditorBlock, newBlockProps } from '@/lib/blocks';
import { type Block, MAX_BLOCKS, siteStore } from '@/lib/db';
import { database, getSite, SITE_EDIT } from '@/lib/sites';

/*
 * What the page editor (#20) saves. Each action checks, through Buildbase,
 * that the signed-in creator may change this site (SITE_EDIT: admins and
 * editors), and the database only ever reaches the site's own workspace.
 */

export type EditResult<T = true> = { ok: T } | { error: string };

const NOT_ALLOWED = 'You can look at this site, but not change it.';

async function editableStore(workspaceId: string) {
  const { site, can } = await getSite(workspaceId);
  if (!can(SITE_EDIT)) return null;
  const store = siteStore(await database(), { workspaceId });
  return { site, store };
}

/** Adds a block of `type` at the end of the page. */
export async function addBlock(
  workspaceId: string,
  pageId: string,
  type: string
): Promise<EditResult<Block>> {
  const edit = await editableStore(workspaceId);
  if (!edit) return { error: NOT_ALLOWED };
  if (!isEditorBlock(type)) return { error: 'That block isn’t offered yet.' };
  const block = await edit.store.addBlock(pageId, type, newBlockProps(type));
  return block
    ? { ok: block }
    : { error: `A page holds up to ${MAX_BLOCKS} blocks.` };
}

/** Saves a block's settings, as the creator types them. */
export async function saveBlock(
  workspaceId: string,
  blockId: string,
  type: string,
  props: unknown
): Promise<EditResult> {
  const edit = await editableStore(workspaceId);
  if (!edit) return { error: NOT_ALLOWED };
  const saved = savedProps(type, props);
  if (!saved) return { error: 'This block holds too much to save.' };
  const page = await edit.store.blockPage(blockId);
  const current = page
    ? (await edit.store.blocks(page)).find((b) => b.id === blockId)
    : undefined;
  if (!current || current.type !== type)
    return { error: 'This block is gone. Reload the page.' };
  await edit.store.updateBlock(blockId, saved);
  return { ok: true };
}

/** Takes a block off the page. */
export async function removeBlock(
  workspaceId: string,
  blockId: string
): Promise<EditResult> {
  const edit = await editableStore(workspaceId);
  if (!edit) return { error: NOT_ALLOWED };
  return (await edit.store.removeBlock(blockId))
    ? { ok: true }
    : { error: 'This block is gone. Reload the page.' };
}

/** Moves a block to `to` in the page's reading order. */
export async function moveBlock(
  workspaceId: string,
  blockId: string,
  to: number
): Promise<EditResult> {
  const edit = await editableStore(workspaceId);
  if (!edit) return { error: NOT_ALLOWED };
  if (!Number.isInteger(to)) return { error: 'Pick a place on the page.' };
  return (await edit.store.moveBlock(blockId, to))
    ? { ok: true }
    : { error: 'This block is gone. Reload the page.' };
}
