// The checks on uploaded pictures (#24). Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pictureSide, readPicture, stripPictureData } from './pictures.ts';

const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [...be16(n >>> 16), ...be16(n & 0xffff)];
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const le24 = (n: number) => [...le16(n & 0xffff), (n >> 16) & 0xff];
const le32 = (n: number) => [...le16(n & 0xffff), ...le16(n >>> 16)];
const has = (bytes: Uint8Array, s: string) =>
  Buffer.from(bytes).includes(Buffer.from(s));

/** A JPEG with camera data (and a place) in APP1 and a comment. */
function jpeg(width: number, height: number) {
  const segment = (marker: number, body: number[]) => [
    0xff,
    marker,
    ...be16(body.length + 2),
    ...body,
  ];
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xe0, [...text('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, [...text('Exif'), 0, 0, ...text('GPS 51.5N 0.1W')]),
    ...segment(0xfe, text('taken at home')),
    ...segment(0xe2, text('ICC_PROFILE')),
    ...segment(0xc0, [8, ...be16(height), ...be16(width), 1, 1, 0x11, 0]),
    ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]),
    0x12,
    0x34,
    0xff,
    0xd9,
  ]);
}

function png(width: number, height: number) {
  const chunk = (type: string, body: number[]) => [
    ...be32(body.length),
    ...text(type),
    ...body,
    0,
    0,
    0,
    0,
  ];
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', [...be32(width), ...be32(height), 8, 6, 0, 0, 0]),
    ...chunk('tEXt', text('Location\0home')),
    ...chunk('eXIf', text('GPS')),
    ...chunk('IDAT', [1, 2, 3]),
    ...chunk('IEND', []),
  ]);
}

function webp(width: number, height: number) {
  const chunk = (type: string, body: number[]) => [
    ...text(type),
    ...le32(body.length),
    ...body,
    ...(body.length % 2 ? [0] : []),
  ];
  const body = [
    ...text('WEBP'),
    // Flags: Exif (0x08) and XMP (0x04) follow.
    ...chunk('VP8X', [0x0c, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)]),
    ...chunk('VP8L', [0x2f, 0, 0, 0, 0]),
    ...chunk('EXIF', text('GPS 51.5N')),
    ...chunk('XMP ', text('<x:xmpmeta/>')),
  ];
  return new Uint8Array([...text('RIFF'), ...le32(body.length), ...body]);
}

test('a picture is known by its bytes, with its size', () => {
  assert.deepEqual(readPicture(jpeg(800, 600)), {
    type: 'image/jpeg',
    width: 800,
    height: 600,
  });
  assert.deepEqual(readPicture(png(32, 16)), {
    type: 'image/png',
    width: 32,
    height: 16,
  });
  assert.deepEqual(readPicture(webp(1200, 900)), {
    type: 'image/webp',
    width: 1200,
    height: 900,
  });
  // Anything else, whatever it is called.
  assert.equal(
    readPicture(new TextEncoder().encode('<svg>…</svg> padding')),
    null
  );
  assert.equal(readPicture(new Uint8Array(4)), null);
  assert.equal(readPicture(jpeg(800, 600).subarray(0, 40)), null);
});

test('camera, place and text data come out; the picture stays', () => {
  const cleanJpeg = stripPictureData(jpeg(800, 600), 'image/jpeg');
  assert.ok(cleanJpeg);
  assert.equal(has(cleanJpeg, 'GPS'), false);
  assert.equal(has(cleanJpeg, 'taken at home'), false);
  assert.equal(has(cleanJpeg, 'ICC_PROFILE'), true);
  assert.deepEqual(readPicture(cleanJpeg)?.width, 800);
  assert.deepEqual([...cleanJpeg.slice(-4)], [0x12, 0x34, 0xff, 0xd9]);

  const cleanPng = stripPictureData(png(32, 16), 'image/png');
  assert.ok(cleanPng);
  assert.equal(has(cleanPng, 'Location'), false);
  assert.equal(has(cleanPng, 'GPS'), false);
  assert.equal(has(cleanPng, 'IDAT'), true);
  assert.equal(has(cleanPng, 'IEND'), true);

  const cleanWebp = stripPictureData(webp(1200, 900), 'image/webp');
  assert.ok(cleanWebp);
  assert.equal(has(cleanWebp, 'GPS'), false);
  assert.equal(has(cleanWebp, 'xmpmeta'), false);
  assert.equal(has(cleanWebp, 'VP8L'), true);
  // The RIFF size and the VP8X flags agree with what's left.
  const view = new DataView(cleanWebp.buffer);
  assert.equal(view.getUint32(4, true), cleanWebp.length - 8);
  assert.equal(cleanWebp[20] & 0x0c, 0);
  assert.deepEqual(readPicture(cleanWebp)?.height, 900);
});

test('a broken picture is refused', () => {
  const cut = jpeg(10, 10).subarray(0, 30);
  assert.equal(stripPictureData(cut, 'image/jpeg'), null);
  const noEnd = png(10, 10).subarray(0, 60);
  assert.equal(stripPictureData(noEnd, 'image/png'), null);
});

test('a profile picture is shrunk more than other pictures', () => {
  assert.ok(pictureSide('avatar') < pictureSide('src'));
});
