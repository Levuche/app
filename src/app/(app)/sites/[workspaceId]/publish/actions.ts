'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/buildbase';
import { siteStore } from '@/lib/db';
import { publishProblems } from '@/lib/publish';
import { database, getSite, SITE_EDIT } from '@/lib/sites';

/*
 * Publishing (#21): each action checks with Buildbase, on every call, that
 * the signed-in creator may change this site (SITE_EDIT: admins and
 * editors), whatever the page showed. The live site's cache is cleared on
 * publish and rollback once the levuche.page Worker serves sites (#23).
 */

async function editable(form: FormData) {
  const workspaceId = String(form.get('workspaceId') ?? '');
  const [{ site, can }, user] = await Promise.all([
    getSite(workspaceId),
    requireUser(),
  ]);
  if (!can(SITE_EDIT))
    throw new Error('You can look at this site, but not change it.');
  return {
    workspaceId,
    site,
    user,
    store: siteStore(await database(), { workspaceId }),
  };
}

const done = (workspaceId: string, outcome: string) => {
  revalidatePath(`/sites/${workspaceId}`, 'layout');
  redirect(`/sites/${workspaceId}/publish?done=${outcome}`);
};

/** Publishes the draft as the next version, when it passes every check. */
export async function publishSite(form: FormData) {
  const { workspaceId, site, user, store } = await editable(form);
  const draft = await store.draft(site.id);
  if (!draft || publishProblems(draft).length > 0)
    redirect(`/sites/${workspaceId}/publish`);
  const note =
    String(form.get('note') ?? '')
      .trim()
      .slice(0, 200) || null;
  const number = await store.publish(site.id, user.id, note);
  done(workspaceId, number ? `published-${number}` : 'not-published');
}

/** Makes another version the live one; the draft stays as it is. */
export async function rollbackSite(form: FormData) {
  const { workspaceId, site, store } = await editable(form);
  const number = Number(form.get('number'));
  const changed =
    Number.isInteger(number) && (await store.rollback(site.id, number));
  done(workspaceId, changed ? `live-${number}` : 'not-changed');
}

/** Turns the private preview link on, with a new address, or off. */
export async function setPreviewLink(form: FormData) {
  const { workspaceId, site, store } = await editable(form);
  const on = form.get('on') === 'true';
  await store.setPreview(site.id, on);
  done(workspaceId, on ? 'preview-on' : 'preview-off');
}
