// Who is signed in, for the Buildbase provider in the browser, which can't
// read the httpOnly cookie. Reads the cookie only and never calls Buildbase,
// so it has no rate limit.
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/buildbase';

export async function GET() {
  const sessionId = (await cookies()).get(SESSION_COOKIE_NAME)?.value || null;
  return NextResponse.json(
    { sessionId },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
