// The server's Buildbase client and the signed-in person. Server code only.
import BuildBase, { type IUserProfile } from '@buildbase/sdk';
import { sessionCookieName } from '@levuche/kit/server';
import { cookies } from 'next/headers';
import { unauthorized } from 'next/navigation';
import { cache } from 'react';
import { buildbase, isAuthConfigured } from '@/lib/buildbase-config';

/**
 * The session cookie levuche.com sets for every levuche.com host, named by
 * @levuche/kit so the two sites can't drift apart. A development environment
 * has its own name, so dev and production never read each other's session.
 */
export const SESSION_COOKIE_NAME = sessionCookieName(buildbase.environment);

async function sessionId() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value || null;
}

export const bb = BuildBase({
  serverUrl: buildbase.serverUrl,
  orgId: buildbase.orgId,
  environment: buildbase.environment,
  getSessionId: sessionId,
});

/**
 * The signed-in person, checked with Buildbase on the server once per
 * request. The cookie alone is never trusted. Null when signed out, when the
 * session has ended, or while sign-in isn't set up here.
 */
export const getUser = cache(async (): Promise<IUserProfile | null> => {
  if (!isAuthConfigured || !(await sessionId())) return null;
  try {
    return await bb.users.getProfile();
  } catch (error) {
    // 401, 403 and 404 mean the session is gone; anything else (Buildbase
    // unreachable, a 5xx) is a real failure for the error page to show.
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403 || status === 404) return null;
    throw error;
  }
});

/**
 * The signed-in creator, for every page, layout and server function that
 * shows or changes a creator's things. With no valid session it stops the
 * render and shows the sign-in screen (src/app/unauthorized.tsx) at the same
 * address, so nothing a page renders reaches a signed-out visitor.
 */
export async function requireUser(): Promise<IUserProfile> {
  return (await getUser()) ?? unauthorized();
}
