'use server';

import { revalidatePath } from 'next/cache';
import { siteStore } from '@/lib/db';
import { database, getSite } from '@/lib/sites';

/**
 * Takes the site at /sites/<workspace id> offline, or puts it back live.
 * Only the site's admins can, checked here with Buildbase on every call,
 * whatever the page showed. Visitors see an "offline" page meanwhile
 * (served by the levuche.page Worker, #23).
 */
export async function setSiteOffline(form: FormData) {
  const workspaceId = String(form.get('workspaceId') ?? '');
  const offline = form.get('offline') === 'true';
  const { site, role } = await getSite(workspaceId);
  if (role !== 'admin')
    throw new Error('Only a site’s admins can take it offline.');
  await siteStore(await database(), { workspaceId }).setOffline(
    site.id,
    offline
  );
  revalidatePath(`/sites/${workspaceId}`);
}
