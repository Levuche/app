/** The app's identity and addresses, in one place. */

/** The production host of the app. */
export const PRODUCTION_APP_URL = 'https://app.levuche.com';

/** The app's own address, without a trailing slash. */
export const appUrl = (
  process.env.NEXT_PUBLIC_APP_URL?.trim() || PRODUCTION_APP_URL
).replace(/\/+$/, '');

export const site = {
  name: 'Levuche',
  description:
    'Connect your social accounts, build your pages, sell and get paid.',
  /** The marketing website, for links out of the app. */
  websiteUrl: 'https://levuche.com',
  themeColor: '#24257A',
} as const;
