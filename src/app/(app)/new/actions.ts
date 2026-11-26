'use server';

import { redirect } from 'next/navigation';
import { bb, requireUser } from '@/lib/buildbase';
import { siteStore } from '@/lib/db';
import { handleProblem, siteAddress } from '@/lib/handle';
import { database } from '@/lib/sites';
import { starterBlocks } from '@/lib/starter';

export interface NewSiteState {
  name: string;
  handle: string;
  error?: string;
}

/**
 * Makes a site: a Buildbase workspace named after it, then its row, handle
 * and home page, with the starting layout, in the database. If the handle is taken, the workspace is
 * deleted again, so a workspace never stands without its site.
 */
export async function createSite(
  _: NewSiteState,
  form: FormData
): Promise<NewSiteState> {
  await requireUser();
  const name = String(form.get('name') ?? '').trim();
  const handle = String(form.get('handle') ?? '')
    .trim()
    .toLowerCase();
  const typed = { name, handle };
  if (!name || name.length > 60)
    return { ...typed, error: 'Give your site a name of up to 60 characters.' };
  const problem = handleProblem(handle);
  if (problem) return { ...typed, error: problem };

  let workspaceId: string;
  try {
    workspaceId = (await bb.workspace.create({ name }))._id;
  } catch (error) {
    const { status, code } = error as { status?: number; code?: string };
    if (status === 409)
      return {
        ...typed,
        error:
          code === 'BUSY'
            ? 'Your last site is still being made. Try again in a moment.'
            : 'You already have a site with that name. Pick another.',
      };
    if (status === 402 || status === 403)
      return {
        ...typed,
        error: "You've made as many sites as your account allows.",
      };
    throw error;
  }

  const site = await siteStore(await database(), { workspaceId })
    .create(handle, starterBlocks(name))
    .catch(async (error: unknown) => {
      await bb.workspace.delete(workspaceId);
      throw error;
    });
  if (!site) {
    await bb.workspace.delete(workspaceId);
    return { ...typed, error: `${siteAddress(handle)} is taken. Try another.` };
  }
  redirect(`/sites/${workspaceId}`);
}
