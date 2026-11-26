/*
 * Pictures creators upload for their pages (#24): what's accepted, how big,
 * and the checks the server runs on the bytes before they're kept. The
 * browser shrinks a picture before it uploads (src/lib/shrink-picture.ts),
 * but nothing here trusts that: the type is read from the bytes, the size
 * and dimensions are checked, and location and camera data are taken out.
 *
 * Plain functions on bytes, so they run in the Worker and in tests.
 */

/** The picture types a creator can upload. */
export const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PictureType = (typeof PICTURE_TYPES)[number];

export const isPictureType = (type: unknown): type is PictureType =>
  (PICTURE_TYPES as readonly unknown[]).includes(type);

/** The most one picture can be, after the browser has shrunk it. */
export const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

/** Each site's room for pictures. */
export const SITE_STORAGE_BYTES = 100 * 1024 * 1024;

/** The longest side the server takes. */
export const MAX_SIDE = 4096;

/**
 * The longest side a picture is shrunk to for a field: a profile picture
 * never shows bigger than a small circle, anything else can fill a screen.
 */
export const pictureSide = (field: string) => (field === 'avatar' ? 640 : 2000);

/** "5 MB", for messages. */
export const megabytes = (bytes: number) =>
  `${Math.round(bytes / (1024 * 1024))} MB`;

export interface PictureInfo {
  type: PictureType;
  width: number;
  height: number;
}

const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | (b[i + 2] << 16);
const u32 = (b: Uint8Array, i: number) =>
  ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u32le = (b: Uint8Array, i: number) =>
  (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const ascii = (b: Uint8Array, i: number, n: number) =>
  String.fromCharCode(...b.subarray(i, i + n));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** JPEG start-of-frame markers, which hold the size. */
const isSof = (marker: number) =>
  marker >= 0xc0 &&
  marker <= 0xcf &&
  marker !== 0xc4 &&
  marker !== 0xc8 &&
  marker !== 0xcc;

/**
 * What the bytes are, read from the bytes themselves: a JPEG, PNG or WebP
 * and its width and height, or null for anything else or a broken file.
 */
export function readPicture(bytes: Uint8Array): PictureInfo | null {
  if (bytes.length < 16) return null;

  if (PNG_SIGNATURE.every((v, i) => bytes[i] === v)) {
    if (ascii(bytes, 12, 4) !== 'IHDR' || bytes.length < 24) return null;
    return { type: 'image/png', width: u32(bytes, 16), height: u32(bytes, 20) };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker === 0xd9 || marker === 0xda) return null;
      const length = u16(bytes, i + 2);
      if (length < 2) return null;
      if (isSof(marker)) {
        if (i + 9 > bytes.length) return null;
        return {
          type: 'image/jpeg',
          height: u16(bytes, i + 5),
          width: u16(bytes, i + 7),
        };
      }
      i += 2 + length;
    }
    return null;
  }

  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const chunk = ascii(bytes, 12, 4);
    const at = 20;
    if (chunk === 'VP8X' && bytes.length >= at + 10)
      return {
        type: 'image/webp',
        width: u24le(bytes, at + 4) + 1,
        height: u24le(bytes, at + 7) + 1,
      };
    if (chunk === 'VP8 ' && bytes.length >= at + 10)
      return {
        type: 'image/webp',
        width: u16le(bytes, at + 6) & 0x3fff,
        height: u16le(bytes, at + 8) & 0x3fff,
      };
    if (chunk === 'VP8L' && bytes.length >= at + 5) {
      const bits = u32le(bytes, at + 1);
      return {
        type: 'image/webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
  }
  return null;
}

/** JPEG segments that carry camera, location or other text data. */
const JPEG_DROP = new Set([
  0xe1, // APP1: Exif (with GPS) and XMP
  0xed, // APP13: IPTC
  0xfe, // COM: comments
]);

/** PNG chunks that carry text, dates or Exif. */
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

/** WebP chunks that carry Exif or XMP. */
const WEBP_DROP = new Set(['EXIF', 'XMP ']);

const join = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    // From the start of the picture data on, everything is kept.
    if (marker === 0xda) {
      parts.push(bytes.subarray(i));
      return join(parts);
    }
    const end = i + 2 + u16(bytes, i + 2);
    if (end > bytes.length) return null;
    if (!JPEG_DROP.has(marker)) parts.push(bytes.subarray(i, end));
    i = end;
  }
  return null;
}

function stripPng(bytes: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= bytes.length) {
    const end = i + 12 + u32(bytes, i);
    if (end > bytes.length) return null;
    const type = ascii(bytes, i + 4, 4);
    if (!PNG_DROP.has(type)) parts.push(bytes.subarray(i, end));
    i = end;
    if (type === 'IEND') return join(parts);
  }
  return null;
}

function stripWebp(bytes: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const size = u32le(bytes, i + 4);
    if (i + 8 + size > bytes.length) return null;
    // Odd chunks are padded to even; some writers leave off the last pad.
    const end = Math.min(i + 8 + size + (size % 2), bytes.length);
    const type = ascii(bytes, i, 4);
    if (!WEBP_DROP.has(type)) {
      const chunk = bytes.slice(i, end);
      // VP8X flags say which extra chunks follow: clear Exif and XMP.
      if (type === 'VP8X') chunk[8] &= ~(0x08 | 0x04);
      parts.push(chunk);
    }
    i = end;
  }
  const body = join(parts);
  const head = new Uint8Array(12);
  head.set(bytes.subarray(0, 12));
  const size = body.length + 4;
  head[4] = size & 0xff;
  head[5] = (size >> 8) & 0xff;
  head[6] = (size >> 16) & 0xff;
  head[7] = (size >>> 24) & 0xff;
  return join([head, body]);
}

/**
 * The picture without its camera, location and text data, or null if the
 * file is broken. Colour profiles and the picture itself are kept as they
 * are.
 */
export function stripPictureData(
  bytes: Uint8Array,
  type: PictureType
): Uint8Array | null {
  if (type === 'image/jpeg') return stripJpeg(bytes);
  if (type === 'image/png') return stripPng(bytes);
  return stripWebp(bytes);
}
