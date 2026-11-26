// Paying for a site (#19): who counts as paid, which add-on sells a site,
// and how its price reads. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IAddOnOffer } from '@buildbase/sdk';
import {
  formatPrice,
  isPaid,
  priceWords,
  siteOffer,
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
