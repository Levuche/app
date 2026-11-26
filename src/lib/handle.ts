/**
 * A site's handle, its address on levuche.page: 3 to 30 lowercase letters
 * and numbers, with single hyphens between them. Taken and reserved handles
 * are refused by the database (src/lib/db.ts); onboarding (#18) adds a live
 * check and suggestions.
 */
export const HANDLE = { pattern: '[a-z0-9]+(-[a-z0-9]+)*', min: 3, max: 30 };

const valid = new RegExp(`^${HANDLE.pattern}$`);

export const isHandle = (value: string) =>
  value.length >= HANDLE.min && value.length <= HANDLE.max && valid.test(value);

/** Where a site lives once it's published. */
export const siteAddress = (handle: string) => `${handle}.levuche.page`;
