/*
 * Shrinks a picture in the browser before it's uploaded (#24): no bigger
 * than the field shows it, turned the right way up, and drawn afresh, so
 * camera and location data are left behind. The server checks it all
 * again (src/lib/pictures.ts). Browser code only.
 */

/** Thrown when the browser can't open the file as a picture. */
export class NotAPicture extends Error {}

const encode = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));

/** The picture at most `side` pixels on its longest side, as WebP. */
export async function shrinkPicture(file: Blob, side: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  }).catch(() => {
    throw new NotAPicture();
  });
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new NotAPicture();
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // WebP where the browser can write it; otherwise PNG for a picture that
  // may be see-through, and JPEG for a photo.
  const webp = await encode(canvas, 'image/webp');
  if (webp?.type === 'image/webp') return webp;
  const fallback = await encode(
    canvas,
    file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  );
  if (!fallback) throw new NotAPicture();
  return fallback;
}
