'use client';

import { useSaaSAuth } from '@buildbase/sdk/react';
import { useRouter } from 'next/navigation';
import { useEffect, useTransition } from 'react';
import { buttonClasses } from '@/lib/button';

/** Set just before the page loads again after sign-in, so it happens once. */
const RELOADED_KEY = 'lv-signed-in-reload';

/**
 * Whether this page may load again for a new session: once per ten seconds,
 * so a server that still says "signed out" can't send it round in a loop.
 */
function mayReload(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOADED_KEY));
    if (last && Date.now() - last < 10_000) return false;
    window.sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

/**
 * The sign-in button for a signed-out visitor. Buildbase's hosted page signs
 * them in, or creates their account, then brings them back to this same
 * address. Once the browser holds a session (back from the hosted page, or
 * signed in on levuche.com in another tab), the page loads again so the one
 * they asked for appears. A full load, not router.refresh(): this screen is
 * the unauthorized() boundary, which a refresh alone can leave in place.
 */
export function SignInButton() {
  const auth = useSaaSAuth();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    if (mayReload()) window.location.reload();
    else startRefresh(() => router.refresh());
  }, [auth.isAuthenticated, router]);

  if (auth.isSessionUnverified) {
    return (
      <p role="status" className="text-lv-text-2 m-0">
        We can&apos;t reach the sign-in service right now. This page tries again
        by itself.
      </p>
    );
  }

  const busy =
    auth.isLoading || auth.isRedirecting || auth.isAuthenticated || refreshing;
  return (
    <button
      type="button"
      className={buttonClasses('primary', 'self-start')}
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={() => {
        const { pathname, search, hash } = window.location;
        void auth.signIn(`${pathname}${search}${hash}`);
      }}
    >
      {busy ? 'Signing in…' : 'Sign in'}
    </button>
  );
}
