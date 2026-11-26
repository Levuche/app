import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { SignInButton } from '@/components/sign-in';
import { isAuthConfigured } from '@/lib/buildbase-config';
import { site } from '@/lib/site';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * Shown, with a 401, in place of any page a signed-out visitor opens
 * (requireUser in src/lib/buildbase.ts). Signing in brings them back to that
 * same address.
 */
export default function Unauthorized() {
  return (
    <PageShell>
      <h1 className="text-title-lg m-0">Sign in to Levuche</h1>
      <p className="text-lv-text-2 m-0">
        Build your page, sell what you make and see how it&apos;s going. New
        here? Signing in creates your account.
      </p>
      {isAuthConfigured ? (
        <SignInButton />
      ) : (
        <p className="m-0">Sign-in isn&apos;t open on this address yet.</p>
      )}
      <p className="m-0">
        <a
          href={site.websiteUrl}
          className="text-lv-link font-semibold underline-offset-4 hover:underline"
        >
          Go to levuche.com
        </a>
      </p>
    </PageShell>
  );
}
