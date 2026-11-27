'use client';

import type { CookieBannerCategory } from '@buildbase/sdk/react';
import { useTracking } from '@buildbase/sdk/tracking';

/**
 * What the cookie banner has to ask about: analytics while an analytics tag
 * (GA4, Clarity and the like) is attached to the app's sign-in client, and
 * marketing while an ad pixel (Google Ads, Meta, LinkedIn and the like) is.
 * The tags come from the Buildbase console (Settings > Tracking & tags), so
 * this follows whatever is attached there. An empty list means there is
 * nothing to ask. Same as levuche.com's.
 *
 * Call it only under the Buildbase provider.
 */
export function useConsentCategories(): CookieBannerCategory[] {
  const { consent } = useTracking();
  const manifest = consent.manifest;
  const categories: CookieBannerCategory[] = [];
  if (manifest.some((entry) => entry.category === 'analytics')) {
    categories.push('analytics');
  }
  if (manifest.some((entry) => entry.category === 'marketing')) {
    categories.push('marketing');
  }
  return categories;
}
