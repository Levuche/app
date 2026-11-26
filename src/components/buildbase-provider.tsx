'use client';

import { ApiVersion } from '@buildbase/sdk';
import { SaaSOSProvider } from '@buildbase/sdk/react';
import { captureReferral } from '@buildbase/sdk/tracking';
import { buildbaseEnvironmentId } from '@levuche/kit';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { buildbase, isAuthConfigured } from '@/lib/buildbase-config';

const json = { 'Content-Type': 'application/json' };

/**
 * Buildbase's own screens, trimmed to how the app uses workspaces: a site is
 * made through the app (src/app/(app)/new) and deleted through #26, so the
 * switcher's "Create workspace" and the settings' danger zone are hidden,
 * and no plan picker opens by itself (a page is bought on its own, #19).
 */
const ui = {
  workspaceSwitcher: { createButton: false },
  settings: { sections: { danger: false } },
  behavior: { autoOpenPlanDialog: false },
};

/** POSTs JSON to one of the app's /api/auth routes. */
async function post(path: string, body: unknown) {
  const res = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    sessionId?: string;
    message?: string;
  };
  if (!res.ok)
    throw new Error(data.message ?? `Sign-in failed (${res.status})`);
  return data;
}

/**
 * Buildbase in the browser: Buildbase's hosted sign-in page, with the session
 * in the httpOnly cookie levuche.com shares (the /api/auth routes keep it).
 * It also keeps an affiliate's ?ref= that levuche.com passed on, so a sale is
 * credited to the same affiliate. Renders without Buildbase until sign-in is
 * set up in the environment.
 */
export function BuildbaseProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const orgId = buildbaseEnvironmentId(buildbase);
    if (orgId) void captureReferral({ serverUrl: buildbase.serverUrl, orgId });
  }, []);

  if (!isAuthConfigured) return children;

  return (
    <SaaSOSProvider
      serverUrl={buildbase.serverUrl}
      version={ApiVersion.V1}
      orgId={buildbase.orgId}
      environment={buildbase.environment}
      ui={ui}
      // The app shows its own state (the button reads "Signing in…"), so
      // Buildbase's full-screen "Redirecting..." cover stays off.
      fullScreenLoader={false}
      auth={{
        clientId: buildbase.clientId,
        redirectUrl: buildbase.redirectUrl,
        callbacks: {
          getSession: async () =>
            (
              (await (await fetch('/api/auth/session')).json()) as {
                sessionId: string | null;
              }
            ).sessionId,
          handleAuthentication: async (code: string) => {
            const { sessionId } = await post('token', { code });
            if (!sessionId) throw new Error('Sign-in failed: no session');
            return { sessionId };
          },
          onSignOut: async () => {
            await post('signout', {});
          },
          // A rename, a teammate or a role changed in Buildbase's screens:
          // render the server's pages again with the new names and roles.
          // Switching sites is the site switcher's (site-switcher.tsx).
          handleEvent: (event) => {
            if (event !== 'workspace:changed') router.refresh();
          },
        },
      }}
    >
      {children}
    </SaaSOSProvider>
  );
}
