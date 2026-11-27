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

/**
 * What Buildbase said when it refused to start a checkout, from the error
 * the SDK throws (a plain Error with Buildbase's `message`, plus the HTTP
 * `status` and, for most refusals, a machine-readable `code`). For the log.
 */
export function checkoutRefusal(error: unknown) {
  const e = (error ?? {}) as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
    reason?: unknown;
  };
  return {
    status: typeof e.status === 'number' ? e.status : null,
    code: typeof e.code === 'string' ? e.code : null,
    reason: typeof e.reason === 'string' ? e.reason : null,
    message:
      typeof e.message === 'string' ? e.message : String(error ?? 'unknown'),
  };
}

/**
 * A short, safe tag for the refusal to carry in the page address (?why=):
 * Buildbase's code, else the HTTP status. Never its message, so a link
 * can't make the page say anything.
 */
export function refusalTag(refusal: {
  status: number | null;
  code: string | null;
}) {
  if (refusal.code && /^[A-Z][A-Z0-9_]{0,59}$/.test(refusal.code))
    return refusal.code;
  if (refusal.status && refusal.status >= 100 && refusal.status <= 599)
    return String(refusal.status);
  return null;
}

const REFUSALS: Record<string, string> = {
  STRIPE_NOT_CONNECTED: 'Payments aren’t set up for Levuche yet.',
  TAX_SETTING_UNAVAILABLE:
    'The payment service couldn’t be reached just now. Try again in a minute.',
  STRIPE_CATALOG_SYNCING:
    'The price is still being set up. Try again in a minute.',
  IDEMPOTENCY_KEY_REUSED: 'That checkout was already used. Reload the page.',
  SUBSCRIPTION_CURRENCY_MISMATCH:
    'This page is billed in another currency than the price.',
  RETURN_URL_REQUIRED: 'The checkout has nowhere to send you back to.',
};

/**
 * The line the Publish page shows when the checkout didn't open (?done=
 * not-bought), with Buildbase's reason when the address carries one.
 */
export function whyNoCheckout(tag: string | undefined) {
  const base = 'The checkout didn’t open.';
  const safe = tag && /^([A-Z][A-Z0-9_]{0,59}|\d{3})$/.test(tag) ? tag : null;
  if (!safe) return `${base} Reload the page and try again.`;
  const known = REFUSALS[safe];
  const said = /^\d{3}$/.test(safe)
    ? `Buildbase answered with error ${safe}`
    : `Buildbase said ${safe}`;
  return known
    ? `${base} ${known} (${said}.)`
    : `${base} ${said}. Reload the page and try again, and if it happens again, send us that code.`;
}
