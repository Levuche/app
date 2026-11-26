// The handle rules the new-site form and createSite share. Run with
// `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  handleProblem,
  handleSuggestions,
  isHandle,
  RESERVED_HANDLES,
  siteAddress,
} from './handle.ts';

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

test("Levuche's own words and well-known brands are kept back", () => {
  for (const handle of ['levuche', 'admin', 'help', 'www', 'instagram'])
    assert.match(handleProblem(handle) ?? '', /kept for Levuche/, handle);
  assert.equal(handleProblem('sam-rivera'), null);
  assert.match(handleProblem('Sam') ?? '', /lowercase/);
  for (const handle of RESERVED_HANDLES)
    assert.equal(isHandle(handle), true, `${handle} is a handle at all`);
});

test('suggestions are valid, unreserved and different', () => {
  const names = handleSuggestions('sam');
  assert.ok(names.length >= 4);
  assert.equal(new Set(names).size, names.length);
  for (const name of names) assert.equal(handleProblem(name), null, name);
  for (const name of handleSuggestions('a-very-long-name-that-fills-it'))
    assert.equal(handleProblem(name), null, name);
  assert.deepEqual(handleSuggestions('--'), []);
});
