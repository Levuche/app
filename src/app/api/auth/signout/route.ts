// Clears the session cookie on the app and levuche.com. The Buildbase
// provider revokes the session itself before it calls this.
import { refuseCrossSiteAuthPost } from '@buildbase/sdk';
import { type NextRequest, NextResponse } from 'next/server';
import { authRateLimited } from '@/lib/rate-limit';
import { writeSessionCookie } from '@/lib/session-cookie';

export async function POST(request: NextRequest) {
  const refused =
    refuseCrossSiteAuthPost(request) ??
    (await authRateLimited(request, 'signout'));
  if (refused) return refused;
  const response = NextResponse.json({ success: true });
  writeSessionCookie(response, request, '');
  return response;
}
