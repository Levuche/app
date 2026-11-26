'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { BILLING_MANAGE } from '@/lib/billing';
import { bb, requireUser } from '@/lib/buildbase';
import { siteStore } from '@/lib/db';
import { publishProblems } from '@/lib/publish';
import { appUrl } from '@/lib/site';
import { database, getSite, SITE_EDIT, siteAddOn } from '@/lib/sites';

/*
 * Publishing (#21): each action checks with Buildbase, on every call, that
 * the signed-in creator may change this site (SITE_EDIT: admins and
 * editors), whatever the page showed, and nothing goes live on a site that
 * hasn't been bought (#19), checked with Buildbase the same way. The live site's cache is cleared on
 * publish and rollback once the levuche.page Worker serves sites (#23).
 */

async function editable(form: FormData) {
  const workspaceId = String(form.get('workspaceId') ?? '');
  const [{ site, can, paid }, user] = await Promise.all([
    getSite(workspaceId),
    requireUser(),
  ]);
  if (!can(SITE_EDIT))
    throw new Error('You can look at this site, but not change it.');
  return {
    workspaceId,
    site,
    paid,
    can,
    user,
    store: siteStore(await database(), { workspaceId }),
  };
}

function done(workspaceId: string, outcome: string): never {
  revalidatePath(`/sites/${workspaceId}`, 'layout');
  redirect(`/sites/${workspaceId}/publish?done=${outcome}`);
}

/** Publishes the draft as the next version, when it passes every check. */
export async function publishSite(form: FormData) {
  const { workspaceId, site, paid, user, store } = await editable(form);
  if (!paid) done(workspaceId, 'needs-buying');
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
  const { workspaceId, site, paid, store } = await editable(form);
  if (!paid) done(workspaceId, 'needs-buying');
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

const backTo = (workspaceId: string, outcome: string) =>
  `${appUrl}/sites/${workspaceId}/publish?done=${outcome}`;

/**
 * Buys the site (#19): opens Buildbase's checkout for the add-on that
 * switches the `site` feature on, at the price Buildbase has for it, and
 * comes back here whether the creator pays or not. Only those who manage
 * the site's billing (its admins) can buy.
 */
export async function buySite(form: FormData) {
  const { workspaceId, paid, can } = await editable(form);
  if (paid) done(workspaceId, 'paid');
  if (!can(BILLING_MANAGE)) throw new Error('Only a site’s admins can buy it.');
  const offer = await siteAddOn(workspaceId);
  if (!offer?.purchasable) done(workspaceId, 'not-for-sale');

  let next: string;
  try {
    const answer = await bb.addOns.purchase(workspaceId, {
      offerSlug: offer.slug,
      currency: offer.price?.currency,
      successUrl: backTo(workspaceId, 'paid'),
      cancelUrl: backTo(workspaceId, 'not-paid'),
      metadata: { workspaceId },
    });
    next =
      answer.kind === 'checkout'
        ? answer.url
        : answer.kind === 'payment_required'
          ? (answer.invoice.hosted_invoice_url ?? '')
          : backTo(workspaceId, 'paid');
  } catch (error) {
    console.error('Buildbase did not start the checkout', error);
    next = '';
  }
  if (!/^https?:\/\//.test(next)) done(workspaceId, 'not-bought');
  redirect(next);
}
