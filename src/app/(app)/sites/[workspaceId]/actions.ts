'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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
  const { site, role, paid } = await getSite(workspaceId);
  if (role !== 'admin')
    throw new Error('Only a site’s admins can take it offline.');
  // Back online is going live again, which a site has to be bought for (#19).
  if (!offline && !paid)
    redirect(`/sites/${workspaceId}/publish?done=needs-buying`);
  await siteStore(await database(), { workspaceId }).setOffline(
    site.id,
    offline
  );
  revalidatePath(`/sites/${workspaceId}`);
}
