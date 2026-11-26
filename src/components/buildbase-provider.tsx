'use client';

import { ApiVersion } from '@buildbase/sdk';
import { SaaSOSProvider } from '@buildbase/sdk/react';
import { captureReferral } from '@buildbase/sdk/tracking';
import { buildbaseEnvironmentId } from '@levuche/kit';
import { useEffect } from 'react';
import { buildbase, isAuthConfigured } from '@/lib/buildbase-config';

const json = { 'Content-Type': 'application/json' };

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
        },
      }}
    >
      {children}
    </SaaSOSProvider>
  );
}
