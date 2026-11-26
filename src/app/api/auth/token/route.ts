// Trades the one-time code from Buildbase's hosted sign-in page for a
// session, kept in the cookie levuche.com shares. The only file that reads
// the client secret.
import { AuthCodeExchangeError, refuseCrossSiteAuthPost } from '@buildbase/sdk';
import { type NextRequest, NextResponse } from 'next/server';
import { bb } from '@/lib/buildbase';
import { buildbase, isAuthConfigured } from '@/lib/buildbase-config';
import { authRateLimited } from '@/lib/rate-limit';
import { writeSessionCookie } from '@/lib/session-cookie';

export async function POST(request: NextRequest) {
  // Only the app's own call: a form on another site must not sign the visitor
  // in to someone else's account.
  const refused =
    refuseCrossSiteAuthPost(request) ??
    (await authRateLimited(request, 'token'));
  if (refused) return refused;

  const clientSecret = process.env.BUILDBASE_CLIENT_SECRET;
  if (!isAuthConfigured || !clientSecret) {
    return NextResponse.json(
      { error: 'Sign-in is not set up' },
      { status: 503 }
    );
  }
  const { code } = (await request.json().catch(() => ({}))) as {
    code?: unknown;
  };
  if (typeof code !== 'string' || !code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }

  try {
    const { sessionId } = await bb.exchangeCode({
      code,
      clientId: buildbase.clientId,
      clientSecret,
    });
    const response = NextResponse.json({ sessionId });
    writeSessionCookie(response, request, sessionId);
    return response;
  } catch (error) {
    // The platform's reason, so a wrong secret can be diagnosed; never the
    // secret itself.
    const e = error instanceof AuthCodeExchangeError ? error : null;
    return NextResponse.json(
      { error: 'Sign-in failed', message: e?.message, code: e?.code },
      { status: e && e.status >= 400 ? e.status : 502 }
    );
  }
}
