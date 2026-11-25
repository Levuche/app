/**
 * GET /api/health: answers 200 while the app is up, for uptime checks and
 * the smoke test after each deploy. It reads nothing and shows nothing
 * private.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
