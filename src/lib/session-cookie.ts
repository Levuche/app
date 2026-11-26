import {
  expireHostOnlySessionCookie,
  sessionCookieOptions,
} from '@levuche/kit/server';
import type { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/buildbase';

/**
 * Sets the session cookie for every levuche.com host, so signing in here
 * signs you in on levuche.com too; an empty value with maxAge 0 signs you
 * out of both. Also removes a cookie kept for this host alone, from before
 * the cookie was shared.
 */
export function writeSessionCookie(
  response: NextResponse,
  request: NextRequest,
  sessionId: string
) {
  response.cookies.set(
    SESSION_COOKIE_NAME,
    sessionId,
    sessionCookieOptions(request.nextUrl, sessionId ? undefined : 0)
  );
  const old = expireHostOnlySessionCookie(SESSION_COOKIE_NAME, request.nextUrl);
  // After cookies.set, which rewrites the Set-Cookie headers it manages.
  if (old) response.headers.append('Set-Cookie', old);
}
