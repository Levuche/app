// Paying for a site (#19): who counts as paid, which add-on sells a site,
// and how its price reads. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IAddOnOffer } from '@buildbase/sdk';
import {
  checkoutRefusal,
  formatPrice,
  isPaid,
  priceWords,
  refusalTag,
  siteOffer,
  whyNoCheckout,
  whyNotForSale,
} from './billing.ts';

const offer = (over: Partial<IAddOnOffer>): IAddOnOffer => ({
  id: 'o1',
  slug: 'page',
  name: 'Page',
  shape: 'lifetime',
  items: [{ itemSlug: 'site', itemKind: 'feature', quantityPerUnit: 1 }],
  maxPerSubject: 1,
  price: { currency: 'usd', amount: 900 },
  held: [],
  purchasable: true,
  ...over,
});

test('only an explicit site feature counts as paid', () => {
  const entitlement = (features: Record<string, boolean>) => ({
    entitlement: { features } as never,
  });
  assert.equal(isPaid(entitlement({ site: true })), true);
  assert.equal(isPaid(entitlement({ site: false })), false);
  assert.equal(isPaid(entitlement({ other: true })), false);
  assert.equal(isPaid({}), false);
  assert.equal(isPaid({ entitlement: undefined }), false);
});

test('the site add-on is found by what it grants, preferring one on sale', () => {
  const unrelated = offer({
    slug: 'extra',
    items: [{ itemSlug: 'stats', itemKind: 'feature', quantityPerUnit: 1 }],
  });
  const held = offer({ slug: 'old', purchasable: false });
  const onSale = offer({ slug: 'page-2' });
  assert.equal(siteOffer([unrelated, held, onSale])?.slug, 'page-2');
  assert.equal(siteOffer([unrelated, held])?.slug, 'old');
  assert.equal(siteOffer([unrelated]), null);
  assert.equal(
    siteOffer([
      offer({
        items: [{ itemSlug: 'site', itemKind: 'limit', quantityPerUnit: 1 }],
      }),
    ]),
    null
  );
});

test('prices read in the currency’s own units', () => {
  assert.equal(formatPrice({ amount: 900, currency: 'usd' }), '$9.00');
  assert.equal(formatPrice({ amount: 1250, currency: 'EUR' }), '€12.50');
  assert.equal(formatPrice({ amount: 900, currency: 'jpy' }), '¥900');
});

test('a reason it can’t be bought says what to do', () => {
  assert.match(
    whyNotForSale({ reason: 'max_per_subject_reached' }),
    /already been bought/
  );
  assert.match(whyNotForSale(null), /isn’t open right now/);
});

test('the price says how long it lasts', () => {
  const base = { price: { amount: 900, currency: 'usd' } };
  assert.equal(priceWords({ ...base, shape: 'lifetime' }), '$9.00, paid once');
  assert.equal(
    priceWords({ ...base, shape: 'one_time', validityDays: 365 }),
    '$9.00 for 365 days'
  );
  assert.equal(
    priceWords({
      price: { amount: 900, currency: 'usd', interval: 'yearly' },
      shape: 'recurring',
    }),
    '$9.00 a year'
  );
  assert.equal(priceWords({ price: null, shape: 'lifetime' }), null);
});

test('a refused checkout keeps what Buildbase said', () => {
  const error = Object.assign(new Error('Payments are not set up'), {
    status: 409,
    code: 'STRIPE_NOT_CONNECTED',
  });
  assert.deepEqual(checkoutRefusal(error), {
    status: 409,
    code: 'STRIPE_NOT_CONNECTED',
    reason: null,
    message: 'Payments are not set up',
  });
  assert.equal(checkoutRefusal(null).message, 'unknown');
  assert.equal(checkoutRefusal('boom').message, 'boom');
});

test('only a code or a status goes in the address', () => {
  assert.equal(
    refusalTag({ status: 409, code: 'STRIPE_NOT_CONNECTED' }),
    'STRIPE_NOT_CONNECTED'
  );
  assert.equal(refusalTag({ status: 502, code: null }), '502');
  assert.equal(refusalTag({ status: 400, code: 'not a code <b>' }), '400');
  assert.equal(refusalTag({ status: null, code: null }), null);
});

test('the page says why the checkout did not open', () => {
  assert.equal(
    whyNoCheckout(undefined),
    'The checkout didn’t open. Reload the page and try again.'
  );
  assert.match(whyNoCheckout('STRIPE_NOT_CONNECTED'), /aren’t set up/);
  assert.match(
    whyNoCheckout('STRIPE_NOT_CONNECTED'),
    /Buildbase said STRIPE_NOT_CONNECTED/
  );
  assert.match(whyNoCheckout('SOME_NEW_CODE'), /Buildbase said SOME_NEW_CODE/);
  assert.match(whyNoCheckout('500'), /error 500/);
  assert.equal(
    whyNoCheckout('<script>'),
    'The checkout didn’t open. Reload the page and try again.'
  );
});
