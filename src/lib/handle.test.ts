// The handle rules the new-site form and createSite share. Run with
// `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isHandle, siteAddress } from './handle.ts';

test('handles are 3 to 30 lowercase letters and numbers, hyphens between', () => {
  for (const handle of [
    'sam',
    'sam-rivera',
    'studio-42',
    'a1b',
    'x'.repeat(30),
  ])
    assert.equal(isHandle(handle), true, handle);
  for (const handle of [
    'ab',
    'x'.repeat(31),
    'Sam',
    '-sam',
    'sam-',
    'sam--rivera',
    'sam rivera',
    'sam_rivera',
    'sam.rivera',
    'sám',
  ])
    assert.equal(isHandle(handle), false, handle);
});

test('a handle is a levuche.page address', () => {
  assert.equal(siteAddress('sam'), 'sam.levuche.page');
});
