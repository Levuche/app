import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

type Limiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

/**
 * A 429 answer when this address has signed in or out too often (the
 * AUTH_LIMITER binding in wrangler.jsonc), or null to carry on. Off the
 * Worker (`next start`, the end-to-end tests) there is no binding, and a
 * failing binding never blocks anyone.
 */
export async function authRateLimited(request: Request, route: string) {
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip) return null;
  try {
    const { env } = getCloudflareContext();
    const limiter = (env as unknown as { AUTH_LIMITER?: Limiter }).AUTH_LIMITER;
    const result = await limiter?.limit({ key: `${route}:${ip}` });
    if (result && !result.success) {
      return NextResponse.json(
        { error: 'Too many tries. Wait a minute and try again.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
  } catch {
    // No Worker context: nothing to count with.
  }
  return null;
}
