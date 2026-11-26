/**
 * Public Buildbase settings, read by the server and the browser. All are safe
 * to expose (NEXT_PUBLIC_*); the client secret is server-only and is read
 * where it is used. The names match levuche.com's, which shares the org and
 * the session cookie with the app.
 */
export const buildbase = {
  serverUrl:
    process.env.NEXT_PUBLIC_BUILDBASE_SERVER_URL?.trim() ||
    'https://api.console.buildbase.app',
  orgId: process.env.NEXT_PUBLIC_BUILDBASE_ORG_ID?.trim() ?? '',
  /** A development environment's key; unset means production. */
  environment:
    process.env.NEXT_PUBLIC_BUILDBASE_ENVIRONMENT?.trim() || undefined,
  clientId: process.env.NEXT_PUBLIC_BUILDBASE_CLIENT_ID?.trim() ?? '',
  redirectUrl: process.env.NEXT_PUBLIC_BUILDBASE_REDIRECT_URL?.trim() ?? '',
};

/** Sign-in needs the org and the app's own sign-in client. */
export const isAuthConfigured = Boolean(
  /^[0-9a-f]{24}$/i.test(buildbase.orgId) &&
  buildbase.clientId &&
  buildbase.redirectUrl
);
