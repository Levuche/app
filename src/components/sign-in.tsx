'use client';

import { useSaaSAuth } from '@buildbase/sdk/react';
import { useRouter } from 'next/navigation';
import { useEffect, useTransition } from 'react';
import { buttonClasses } from '@/lib/button';

/**
 * The sign-in button for a signed-out visitor. Buildbase's hosted page signs
 * them in, or creates their account, then brings them back to this same
 * address. Once the browser holds a session (back from the hosted page, or
 * signed in on levuche.com in another tab), the server's view is refreshed
 * so the page they asked for appears.
 */
export function SignInButton() {
  const auth = useSaaSAuth();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  useEffect(() => {
    if (auth.isAuthenticated) startRefresh(() => router.refresh());
  }, [auth.isAuthenticated, router]);

  if (auth.isSessionUnverified) {
    return (
      <p role="status" className="text-lv-text-2 m-0">
        We can&apos;t reach the sign-in service right now. This page tries again
        by itself.
      </p>
    );
  }

  const busy = auth.isLoading || auth.isRedirecting || refreshing;
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
