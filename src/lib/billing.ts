// Paying for a site (#19). Each site is bought once, through a Buildbase
// add-on on the site's workspace that switches on the `site` feature. The
// add-on, its price and its terms are set in Buildbase (Billing > Add-ons),
// never here. These helpers take no Buildbase client, so they can be tested
// on their own; src/lib/sites.ts and the publish actions call Buildbase.
import type { IAddOnOffer, IWorkspace } from '@buildbase/sdk';

/** The Buildbase feature a site's add-on switches on. */
export const SITE_FEATURE = 'site';

/** Buildbase's permission to buy for a workspace: its admins. */
export const BILLING_MANAGE = 'workspace:billing:manage';
/** Buildbase's permission to see a workspace's billing and receipts. */
export const BILLING_VIEW = 'workspace:billing:view';

/**
 * Whether the workspace holds the `site` feature, as Buildbase composed its
 * entitlement. Anything short of an explicit yes is no: a workspace with no
 * entitlement (an older server) or a lapsed one can't go live.
 */
export const isPaid = (workspace: Pick<IWorkspace, 'entitlement'>) =>
  workspace.entitlement?.features?.[SITE_FEATURE] === true;

/**
 * The add-on that switches the `site` feature on, among those Buildbase
 * offers a workspace: one that can be bought now if there is one. Found by
 * what it grants, so its slug and name can change in Buildbase.
 */
export function siteOffer(offers: readonly IAddOnOffer[]) {
  const grantsSite = offers.filter((offer) =>
    offer.items.some(
      (item) => item.itemSlug === SITE_FEATURE && item.itemKind === 'feature'
    )
  );
  return grantsSite.find((offer) => offer.purchasable) ?? grantsSite[0] ?? null;
}

/** A price in a currency's smallest unit (cents), as people read it. */
export function formatPrice(price: { amount: number; currency: string }) {
  const currency = price.currency.toUpperCase();
  try {
    const format = new Intl.NumberFormat('en', { style: 'currency', currency });
    const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
    return format.format(price.amount / 10 ** digits);
  } catch {
    return `${(price.amount / 100).toFixed(2)} ${currency}`;
  }
}

/** Why an add-on can't be bought now, in words for the creator. */
export function whyNotForSale(offer: Pick<IAddOnOffer, 'reason'> | null) {
  if (offer?.reason === 'max_per_subject_reached')
    return 'This site has already been bought. If it still says it isn’t, reload the page in a moment.';
  return 'Buying a page isn’t open right now, so this one can’t go live yet. Your draft and preview link still work.';
}

const INTERVALS: Record<string, string> = {
  monthly: 'a month',
  quarterly: 'every three months',
  yearly: 'a year',
};

/** What buying the add-on costs and for how long, or null with no price. */
export function priceWords(
  offer: Pick<IAddOnOffer, 'price' | 'shape' | 'validityDays'>
) {
  if (!offer.price) return null;
  const price = formatPrice(offer.price);
  if (offer.shape === 'lifetime') return `${price}, paid once`;
  if (offer.shape === 'one_time' && offer.validityDays)
    return `${price} for ${offer.validityDays} days`;
  if (offer.shape === 'recurring' && offer.price.interval)
    return `${price} ${INTERVALS[offer.price.interval] ?? `each ${offer.price.interval}`}`;
  return price;
}
