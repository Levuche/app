// A creator's sites. Each site is one Buildbase workspace (docs/SITES.md):
// Buildbase keeps its name, picture, members and roles; the app's database
// keeps the site itself (src/lib/db.ts). Server code only.
import type { IWorkspace } from '@buildbase/sdk';
import type { D1Database } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { isPaid, siteOffer } from '@/lib/billing';
import { bb, requireUser } from '@/lib/buildbase';
import { type Site, siteStore } from '@/lib/db';
import type { FileBucket } from '@/lib/files';

/** The app's own Buildbase permission to change a site: admins and editors. */
export const SITE_EDIT = 'app:site:edit';

export type CreatorSite = Site &
  Pick<IWorkspace, 'name' | 'image'> & { workspaceId: string };

/** The app's D1 database (the DB binding in wrangler.jsonc). */
export async function database() {
  const { env } = await getCloudflareContext({ async: true });
  return (env as unknown as { DB: D1Database }).DB;
}

/** The bucket uploaded pictures are kept in (the FILES binding, #24). */
export async function fileBucket() {
  const { env } = await getCloudflareContext({ async: true });
  return (env as unknown as { FILES: FileBucket }).FILES;
}

const withWorkspace = (
  site: Site,
  { _id, name, image }: IWorkspace
): CreatorSite => ({ ...site, workspaceId: _id, name, image });

/** The signed-in creator's sites, in the order Buildbase lists them. */
export const listSites = cache(async () => {
  await requireUser();
  const [workspaces, db] = await Promise.all([bb.workspace.list(), database()]);
  const sites = await Promise.all(
    workspaces.map(async (workspace) => {
      const [site] = await siteStore(db, { workspaceId: workspace._id }).list();
      return site && withWorkspace(site, workspace);
    })
  );
  return sites.filter((site) => site !== undefined);
});

/**
 * The site at /sites/<workspace id> and what the signed-in creator may do
 * there, asked of Buildbase once per request. To anyone who isn't a member
 * of its workspace, it's "not found", as if it didn't exist.
 */
export const getSite = cache(async (workspaceId: string) => {
  if (!/^[0-9a-f]{24}$/.test(workspaceId)) notFound();
  await requireUser();
  const [workspace, me, db] = await Promise.all([
    bb.workspace.get(workspaceId),
    bb.workspace.permissions(workspaceId),
    database(),
  ]).catch((error: { status?: number }) => {
    if (error.status === 403 || error.status === 404) notFound();
    throw error;
  });
  if (!me.role) notFound();
  const [site] = await siteStore(db, { workspaceId }).list();
  if (!site) notFound();

  return {
    site: withWorkspace(site, workspace),
    role: me.role,
    /**
     * Whether the site has been bought (#19), from Buildbase's answer for
     * this request: it can't go live until it has.
     */
    paid: isPaid(workspace),
    /** The workspace's members' names, by Buildbase user id. */
    memberNames: new Map(
      (workspace.users ?? []).map((user) => [
        (user as { id?: string }).id ?? user._id,
        user.name,
      ])
    ),
    /** A permission as Buildbase resolves it; admins hold every one. */
    can: (permission: string) =>
      me.role === 'admin' || me.permissions.includes(permission),
  };
});

/**
 * The add-on that sells this site (#19), as Buildbase offers it to the
 * workspace now, with its price in the workspace's currency. Null when none
 * is on sale or Buildbase couldn't say.
 */
export async function siteAddOn(workspaceId: string) {
  try {
    return siteOffer((await bb.addOns.list(workspaceId)).offers ?? []);
  } catch (error) {
    console.error('Buildbase did not list the add-ons', error);
    return null;
  }
}
