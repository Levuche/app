import type { SiteStatus } from './db';

/** How the overview says a site's status, and what it means for visitors. */
export const SITE_STATUS: Record<
  Exclude<SiteStatus, 'deleted'>,
  { label: string; detail: string }
> = {
  unpublished: {
    label: 'Not live yet',
    detail: 'Visitors see a "not live yet" page until you publish.',
  },
  live: {
    label: 'Live',
    detail: 'Anyone with the link can see your page.',
  },
  offline: {
    label: 'Offline',
    detail: 'You took it offline. Visitors see that it isn’t available.',
  },
  paused: {
    label: 'Paused by Levuche',
    detail:
      'The Levuche team paused it after a report. Visitors see that it isn’t available.',
  },
};
