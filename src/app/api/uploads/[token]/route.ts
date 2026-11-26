import { finishUpload, fileUrl, sweepFiles } from '@/lib/files';
import { appUrl } from '@/lib/site';
import { MAX_PICTURE_BYTES } from '@/lib/pictures';
import { database, fileBucket } from '@/lib/sites';

/** What each refusal says to the creator. */
const ERRORS = {
  expired: 'This upload took too long. Try again.',
  'wrong-type':
    'This picture’s type can’t be used. Use a JPEG, PNG or WebP picture.',
  'too-big': 'This picture is too big to upload.',
  'too-large':
    'This picture is too large. Use one under 4096 pixels on each side.',
  broken: 'This picture couldn’t be read. Try saving it again, then upload it.',
  full: 'Your site’s storage is full. Take out pictures you don’t use, publish, then try again.',
} as const;

const answer = (body: object, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Where the editor sends a picture (#24): the address startPictureUpload
 * gave it, for ten minutes and once. The address is the permission, so the
 * picture goes straight from the browser to the bucket.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_PICTURE_BYTES)
    return answer({ error: ERRORS['too-big'] }, 413);
  const sent = new Uint8Array(await request.arrayBuffer());
  const db = await database();
  const bucket = await fileBucket();
  const result = await finishUpload(db, bucket, token, sent);
  if ('error' in result)
    return answer(
      { error: ERRORS[result.error] },
      result.error === 'expired' ? 410 : 422
    );
  // A good moment to clear out what this site no longer uses.
  await sweepFiles(db, bucket, result.file.siteId);
  return answer({
    url: fileUrl(appUrl, result.file.id),
  });
}
