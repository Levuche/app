import { fileKey, storedFile } from '@/lib/files';
import { database, fileBucket } from '@/lib/sites';

/**
 * An uploaded picture (#24), for creator pages on levuche.page and for the
 * editor's preview. Public, as the pages that show it are, and never
 * changing, since a new picture gets a new address.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const file = await storedFile(await database(), id);
  const object = file ? await (await fileBucket()).get(fileKey(file.id)) : null;
  if (!file || !object)
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  return new Response(object.body, {
    headers: {
      'Content-Type': file.type,
      'Content-Length': String(object.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': 'inline',
      // Shown on levuche.page, another site.
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
